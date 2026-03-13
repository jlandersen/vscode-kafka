import * as fs from "fs";
import * as jks from "jks-js";
import { minimatch } from "minimatch";
import { Admin, Producer as PlatformaticProducer, Consumer as PlatformaticConsumer, ConfigResourceTypes } from "@platformatic/kafka";
import type { CompressionAlgorithmValue } from "@platformatic/kafka";

import { Disposable } from "vscode";
import { ClientAccessor, ClientState } from ".";
import { getClusterProvider } from "../kafka-extensions/registry";
import { getWorkspaceSettings, WorkspaceSettings } from "../settings";
import { TopicSortOption } from "../settings/workspace";
import { ConsumerConfig, KafkaProducer, KafkaConsumer, PartitionOffset, TopicPartitionOffsets, ProducerRecord, RecordMetadata, KafkaClientConfig } from "./types";

const compressionMap: Record<number, CompressionAlgorithmValue> = {
    0: 'none',
    1: 'gzip',
    2: 'snappy',
    3: 'lz4',
    4: 'zstd',
};

/**
 * Adapter that wraps a @platformatic/kafka Producer to implement the abstract KafkaProducer interface.
 */
export class PlatformaticProducerAdapter implements KafkaProducer {
    constructor(private producer: PlatformaticProducer, private onDisconnect?: () => void) {}

    async connect(): Promise<void> {
        // Platformatic uses lazy auto-connect, no explicit connect needed
    }

    async disconnect(): Promise<void> {
        await this.producer.close();
        this.onDisconnect?.();
    }

    async send(record: ProducerRecord): Promise<RecordMetadata[]> {
        const messages = record.messages.map(m => ({
            topic: record.topic,
            key: m.key !== null && m.key !== undefined ? (Buffer.isBuffer(m.key) ? m.key : Buffer.from(String(m.key))) : undefined,
            value: m.value !== null ? (Buffer.isBuffer(m.value) ? m.value : Buffer.from(String(m.value))) : undefined,
            partition: m.partition,
            headers: m.headers ? new Map(
                Object.entries(m.headers)
                    .filter((entry): entry is [string, Buffer | string] => entry[1] !== undefined && !Array.isArray(entry[1]))
                    .map(([k, v]) => [Buffer.from(k), Buffer.from(typeof v === 'string' ? v : v)])
            ) : undefined,
            timestamp: m.timestamp ? BigInt(m.timestamp) : undefined,
        }));

        const result = await this.producer.send({
            messages,
            acks: record.acks,
            compression: record.compression !== undefined ? compressionMap[record.compression] : undefined,
        });

        if (!result.offsets) {
            return [];
        }

        return result.offsets.map(r => ({
            topicName: r.topic,
            partition: r.partition,
            errorCode: 0,
            baseOffset: r.offset.toString(),
        }));
    }
}

/**
 * Adapter that wraps a @platformatic/kafka Consumer to implement the abstract KafkaConsumer interface.
 * Bridges the stream-based consume() API to the eachMessage callback pattern.
 */
export class PlatformaticConsumerAdapter implements KafkaConsumer {
    private subscribedTopic?: string;
    private fromBeginning?: boolean;
    private stream?: import("@platformatic/kafka").MessagesStream<Buffer, Buffer, Buffer, Buffer>;
    private seekPending: Map<string, string> = new Map();

    private readonly configuredPartitions?: number[];

    constructor(private consumer: PlatformaticConsumer, partitions?: number[]) {
        this.configuredPartitions = partitions;
    }

    async connect(): Promise<void> {
        // Platformatic uses lazy auto-connect
    }

    async disconnect(): Promise<void> {
        if (this.stream) {
            try {
                await this.stream.close();
            } catch {
                // Stream may already be closed or errored
            }
        }
        try {
            await this.consumer.close();
        } catch {
            // Consumer may already be closed
        }
    }

    async subscribe(options: { topic: string; fromBeginning?: boolean }): Promise<void> {
        this.subscribedTopic = options.topic;
        this.fromBeginning = options.fromBeginning;
    }

    async run(options: { eachMessage: (payload: { topic: string; partition: number; message: { key: Buffer | null; value: Buffer | null; timestamp: string; offset: string; headers?: any } }) => Promise<void>; onError?: (error: Error) => void }): Promise<void> {
        if (!this.subscribedTopic) {
            throw new Error('Must call subscribe() before run()');
        }

        let mode: string = 'latest';
        if (this.fromBeginning === true) {
            mode = 'earliest';
        } else if (this.fromBeginning === false) {
            mode = 'latest';
        }

        const offsets = this.seekPending.size > 0
            ? Array.from(this.seekPending.entries()).map(([key, offset]) => {
                const [topic, partition] = key.split(':');
                return { topic, partition: parseInt(partition, 10), offset: BigInt(offset) };
            })
            : undefined;

        if (offsets) {
            mode = 'manual';
        }

        const consumeOptions: any = {
            topics: [this.subscribedTopic],
            mode: mode as any,
            ...(offsets && { offsets }),
            ...(this.configuredPartitions && { partitions: this.configuredPartitions }),
        };

        this.stream = await this.consumer.consume(consumeOptions);

        this.stream.on('error', (err: Error) => {
            if (options.onError) {
                options.onError(err);
            }
        });

        // Sequential promise chain ensures messages are processed in order
        let processing = Promise.resolve();

        this.stream.on('data', (message: any) => {
            processing = processing.then(async () => {
                const headers: Record<string, Buffer | string> = {};
                if (message.headers instanceof Map) {
                    for (const [k, v] of message.headers) {
                        headers[typeof k === 'string' ? k : k.toString()] =
                            typeof v === 'string' ? v : (v instanceof Buffer ? v : Buffer.from(String(v)));
                    }
                }

                await options.eachMessage({
                    topic: message.topic,
                    partition: message.partition ?? 0,
                    message: {
                        key: message.key ?? null,
                        value: message.value ?? null,
                        timestamp: message.timestamp !== undefined ? message.timestamp.toString() : '',
                        offset: message.offset !== undefined ? message.offset.toString() : '0',
                        headers,
                    },
                });
            }).catch((err: Error) => {
                if (options.onError) {
                    options.onError(err);
                }
            });
        });
    }

    seek(options: { topic: string; partition: number; offset: string }): void {
        this.seekPending.set(`${options.topic}:${options.partition}`, options.offset);
    }
}

export interface ConnectionOptions {
    clusterProviderId?: string;
    bootstrap: string;
    saslOption?: SaslOption;
    ssl?: SslOption | boolean;
    schemaRegistryId?: string;
}

export interface Cluster extends ConnectionOptions {
    id: string;
    name: string;
}

/**
 * The supported SASL mechanisms for authentication.
 */
export type SaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512" | "oauthbearer" | "aws";

/**
 * SASL authentication options.
 * Different mechanisms require different fields:
 * - plain, scram-sha-256, scram-sha-512: username, password
 * - oauthbearer: oauthTokenEndpoint, oauthClientId, oauthClientSecret
 * - aws: awsRegion, awsAccessKeyId, awsSecretAccessKey, awsSessionToken (optional)
 */
export interface SaslOption {
    mechanism: SaslMechanism;
    // Username/Password authentication (plain, scram-sha-256, scram-sha-512)
    username?: string;
    password?: string;
    // OAUTHBEARER authentication
    oauthTokenEndpoint?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    // AWS MSK IAM authentication
    awsRegion?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsSessionToken?: string;
}

/**
 * The SSL option.
 */
export interface SslOption {
    ca?: string;
    key?: string;
    cert?: string;
    passphrase?: string;
    rejectUnauthorized?: boolean;
    truststore?: string;
    truststorePassword?: string;
}

export interface Broker {
    id: string;
    host: string;
    port: number;
    isController: boolean;
}

export interface Topic {
    id: string;
    partitionCount: number;
    replicationFactor: number;
    partitions: {
        [id: string]: TopicPartition;
    };
}

export interface TopicPartition {
    partition: string;
    isr: string[];
    replicas: string[];
    leader: string;
}

export interface ConfigEntry {
    configName: string;
    configValue: string | null;
}

export interface CreateTopicRequest {
    topic: string;
    partitions: number;
    replicationFactor: number;
}

export interface DeleteTopicRequest {
    topics: string[];
    timeout?: number | undefined;
}

export interface ConsumerGroup {
    groupId: string;
    state: "Unknown" | "PreparingRebalance" | "CompletingRebalance" | "Stable" | "Dead" | "Empty";
    protocol: string;
    protocolType: string;
    members: ConsumerGroupMember[];
    offsets: ConsumerGroupOffset[];
}

export interface ConsumerGroupMember {
    memberId: string;
    clientId: string;
    clientHost: string;
}

export interface ConsumerGroupOffset {
    topic: string;
    partition: number;
    start: string;
    end: string;
    offset: string;
    lag: string;
}

export interface Client extends Disposable {
    state: ClientState;
    cluster: Cluster;
    producer(): Promise<KafkaProducer>;
    consumer(config?: ConsumerConfig): Promise<KafkaConsumer>;
    connect(): Promise<void>;
    getTopics(): Promise<Topic[]>;
    getBrokers(): Promise<Broker[]>;
    getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]>;
    getTopicConfigs(topicId: string): Promise<ConfigEntry[]>;
    getConsumerGroupIds(): Promise<string[]>;
    getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup>;
    deleteConsumerGroups(groupIds: string[]): Promise<void>;
    createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]>;
    deleteTopic(deleteTopicRequest: DeleteTopicRequest): Promise<void>;
    deleteTopicRecords(topic: string, partitions: PartitionOffset[]): Promise<void>;
    fetchTopicPartitions(topic: string): Promise<number[]>;
    fetchTopicOffsets(topic: string): Promise<TopicPartitionOffsets[]>;
    fetchTopicOffsetsByTimestamp(topic: string, timestamp: string): Promise<PartitionOffset[]>;
}

class EnsureConnectedDecorator implements Client {
    public state = ClientState.disconnected;

    constructor(private client: Client) {
    }

    get cluster(): Cluster {
        return this.client.cluster;
    }

    public async producer(): Promise<KafkaProducer> {
        await this.waitUntilConnected();
        return await this.client.producer();
    }

    public async consumer(config?: ConsumerConfig): Promise<KafkaConsumer> {
        await this.waitUntilConnected();
        return await this.client.consumer(config);
    }

    public connect(): Promise<void> {
        return this.client.connect();
    }

    public async getTopics(): Promise<Topic[]> {
        await this.waitUntilConnected();
        return await this.client.getTopics();
    }

    public async getBrokers(): Promise<Broker[]> {
        await this.waitUntilConnected();
        return await this.client.getBrokers();
    }

    public async getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        await this.waitUntilConnected();
        return await this.client.getBrokerConfigs(brokerId);
    }

    public async getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        await this.waitUntilConnected();
        return this.client.getTopicConfigs(topicId);
    }

    public async getConsumerGroupIds(): Promise<string[]> {
        await this.waitUntilConnected();
        return this.client.getConsumerGroupIds();
    }

    public async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        await this.waitUntilConnected();
        return await this.client.getConsumerGroupDetails(groupId);
    }

    public async deleteConsumerGroups(groupIds: string[]): Promise<void> {
        await this.waitUntilConnected();
        return await this.client.deleteConsumerGroups(groupIds);
    }

    public async createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        await this.waitUntilConnected();
        return await this.client.createTopic(createTopicRequest);
    }

    public async deleteTopic(deleteTopicRequest: DeleteTopicRequest): Promise<void> {
        await this.waitUntilConnected();
        return await this.client.deleteTopic(deleteTopicRequest);
    }

    public async deleteTopicRecords(topic: string, partitions: PartitionOffset[]): Promise<void> {
        await this.waitUntilConnected();
        return await this.client.deleteTopicRecords(topic, partitions);
    }

    public async fetchTopicPartitions(topic: string): Promise<number[]> {
        await this.waitUntilConnected();
        return await this.client.fetchTopicPartitions(topic);
    }

    public async fetchTopicOffsets(topic: string): Promise<TopicPartitionOffsets[]> {
        await this.waitUntilConnected();
        return await this.client.fetchTopicOffsets(topic);
    }

    public async fetchTopicOffsetsByTimestamp(topic: string, timestamp: string): Promise<PartitionOffset[]> {
        await this.waitUntilConnected();
        return await this.client.fetchTopicOffsetsByTimestamp(topic, timestamp);
    }

    public dispose(): void {
        return this.client.dispose();
    }

    private async waitUntilConnected(): Promise<void> {
        if (this.state === ClientState.connected) {
            return;
        }
        const clientAccessor = ClientAccessor.getInstance();
        try {
            clientAccessor.changeState(this, ClientState.connecting);
            await this.client.connect();
            clientAccessor.changeState(this, ClientState.connected);
        } catch (error) {
            clientAccessor.changeState(this, ClientState.invalid);
            const message = error instanceof Error ? error.message : undefined;
            if (message) {
                throw new Error(`Failed operation - ${message}`);
            } else {
                throw new Error(`Failed operation`);
            }
        }
    }
}

export interface PlatformaticClientConfig {
    clientId: string;
    bootstrapBrokers: string[];
    tls?: Record<string, unknown>;
    sasl?: Record<string, unknown>;
    connectTimeout?: number;
    requestTimeout?: number;
}

export class PlatformaticClient implements Client {
    private adminClient: Admin | undefined;
    private producerClient: PlatformaticProducer | undefined;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    private configPromise: Promise<PlatformaticClient>;
    private clientConfig: PlatformaticClientConfig | undefined;
    private error: any;

    constructor(public readonly cluster: Cluster, prebuiltConfig?: PlatformaticClientConfig) {
        this.metadata = {
            brokers: [],
            topics: [],
        };
        if (prebuiltConfig) {
            this.clientConfig = prebuiltConfig;
            this.configPromise = Promise.resolve(this);
        } else {
            this.configPromise = this.createConfigPromise();
        }
    }

    private async createConfigPromise(): Promise<PlatformaticClient> {
        return createKafkaConfig(this.cluster)
            .then(config => {
                this.error = undefined;
                this.clientConfig = config;
                return this;
            }, (error) => {
                this.error = error;
                return this;
            });
    }

    private async getConfigPromise(): Promise<PlatformaticClient> {
        if (this.error) {
            this.configPromise = this.createConfigPromise();
        }
        return this.configPromise;
    }

    public get state(): ClientState {
        return ClientState.disconnected;
    }

    private async getClientConfig(): Promise<PlatformaticClientConfig> {
        const promise = await this.getConfigPromise();
        const config = promise.clientConfig;
        if (!config) {
            if (promise.error) {
                throw promise.error;
            }
            throw new Error('Kafka client config cannot be null.');
        }
        return config;
    }

    protected async getKafkaAdminClient(): Promise<Admin> {
        if (!this.adminClient) {
            const config = await this.getClientConfig();
            this.adminClient = new Admin(config as any);
        }
        return this.adminClient;
    }

    public async producer(): Promise<KafkaProducer> {
        if (!this.producerClient) {
            const config = await this.getClientConfig();
            this.producerClient = new PlatformaticProducer({
                ...config,
                autocreateTopics: true,
            } as any);
        }
        return new PlatformaticProducerAdapter(this.producerClient, () => {
            this.producerClient = undefined;
        });
    }

    public async consumer(config: ConsumerConfig): Promise<KafkaConsumer> {
        const clientConfig = await this.getClientConfig();
        const consumerConfig = buildConsumerConfig(clientConfig, config);

        const consumer = new PlatformaticConsumer(consumerConfig as any);
        return new PlatformaticConsumerAdapter(consumer, (config as any).partitions);
    }

    async connect(): Promise<void> {
        try {
            const admin = await this.getKafkaAdminClient();
            await admin.metadata({} as any);
        } catch (error) {
            if (this.adminClient) {
                try { this.adminClient.close(); } catch { /* ignore */ }
                this.adminClient = undefined;
            }
            throw error;
        }
    }

    async getTopics(): Promise<Topic[]> {
        const admin = await this.getKafkaAdminClient();
        const topicNames = await admin.listTopics();
        if (topicNames.length === 0) {
            this.metadata = { ...this.metadata, topics: [] };
            return [];
        }

        const metadata = await admin.metadata({ topics: topicNames } as any);

        this.metadata = {
            ...this.metadata,
            topics: Array.from(metadata.topics.entries()).map(([name, topicMeta]) => {
                const partitions = topicMeta.partitions.reduce((prev: Record<string, TopicPartition>, p, index) => ({
                    ...prev, [index.toString()]: {
                        partition: index.toString(),
                        leader: p.leader.toString(),
                        replicas: p.replicas.map((r: number) => r.toString()),
                        isr: p.isr.map((r: number) => r.toString()),
                    }
                }), {});

                return {
                    id: name,
                    partitionCount: topicMeta.partitionsCount,
                    partitions,
                    replicationFactor: topicMeta.partitions[0]?.replicas.length ?? 0,
                };
            }),
        };

        return this.metadata.topics;
    }

    async getBrokers(): Promise<Broker[]> {
        const admin = await this.getKafkaAdminClient();
        const metadata = await admin.metadata({} as any);

        this.metadata = {
            ...this.metadata,
            brokers: Array.from(metadata.brokers.entries()).map(([nodeId, broker]) => ({
                id: nodeId.toString(),
                host: broker.host,
                port: broker.port,
                isController: nodeId === metadata.controllerId,
            })),
        };

        return this.metadata.brokers;
    }

    async getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        const admin = await this.getKafkaAdminClient();
        const result = await admin.describeConfigs({
            resources: [{
                resourceType: ConfigResourceTypes.BROKER,
                resourceName: brokerId,
            } as any],
        });

        return result[0].configs.map(c => ({
            configName: c.name,
            configValue: c.value ?? null,
        }));
    }

    async getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        const admin = await this.getKafkaAdminClient();
        const result = await admin.describeConfigs({
            resources: [{
                resourceType: ConfigResourceTypes.TOPIC,
                resourceName: topicId,
            } as any],
        });

        return result[0].configs.map(c => ({
            configName: c.name,
            configValue: c.value ?? null,
        }));
    }

    async getConsumerGroupIds(): Promise<string[]> {
        const admin = await this.getKafkaAdminClient();
        const groups = await admin.listGroups();
        return Array.from(groups.keys());
    }

    async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        const admin = await this.getKafkaAdminClient();

        // describeGroups can hang for groups with non-standard protocols (e.g.
        // Schema Registry) because the library's member-metadata parser throws
        // inside a callback, leaving the promise permanently unsettled. Race it
        // against a timeout so the rest of the method still completes.
        const describePromise = admin.describeGroups({ groups: [groupId] })
            .then((map: Map<string, any>) => map.get(groupId) ?? null);

        const groupOrNull = await Promise.race([
            describePromise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
        ]);

        const offsetsResult = await admin.listConsumerGroupOffsets({ groups: [groupId] });
        const groupOffsets = offsetsResult[0];

        const topicNames = groupOffsets.topics.map(t => t.name);

        // Fetch metadata for all topics in the group. The client library skips
        // internal topics (e.g. _schemas) when caching metadata, which causes
        // listOffsets to hang with an uncaught TypeError. By checking metadata
        // first we can skip those topics safely.
        const metadata = await (admin as any).metadata({ topics: topicNames });
        const knownTopics = new Set<string>(
            topicNames.filter(name => metadata.topics.get(name) != null)
        );

        let consumerGroupOffsets = new Array<ConsumerGroupOffset>();
        for (const topicOffsets of groupOffsets.topics) {
            const topicName = topicOffsets.name;
            const partitionIndexes = topicOffsets.partitions.map(p => p.partitionIndex);

            let latestByPartition = new Map<number, bigint>();
            let earliestByPartition = new Map<number, bigint>();

            if (knownTopics.has(topicName)) {
                try {
                    const [latestOffsets, earliestOffsets] = await Promise.all([
                        admin.listOffsets({
                            topics: [{
                                name: topicName,
                                partitions: partitionIndexes.map(p => ({ partitionIndex: p, timestamp: -1n })),
                            }],
                        }),
                        admin.listOffsets({
                            topics: [{
                                name: topicName,
                                partitions: partitionIndexes.map(p => ({ partitionIndex: p, timestamp: -2n })),
                            }],
                        }),
                    ]);

                    latestByPartition = new Map(
                        latestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []
                    );
                    earliestByPartition = new Map(
                        earliestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []
                    );
                } catch {
                    // Offset range unavailable — committed offsets are still shown below.
                }
            }

            for (const partition of topicOffsets.partitions) {
                const high = latestByPartition.get(partition.partitionIndex)?.toString() ?? '?';
                const low = earliestByPartition.get(partition.partitionIndex)?.toString() ?? '?';
                const offset = partition.committedOffset.toString();
                const lag = high !== '?' ? (parseInt(high) - parseInt(offset)).toString() : '?';
                consumerGroupOffsets.push({
                    topic: topicName,
                    partition: partition.partitionIndex,
                    start: low,
                    end: high,
                    offset,
                    lag,
                });
            }
        }

        const stateMap: Record<string, ConsumerGroup['state']> = {
            'PREPARING_REBALANCE': 'PreparingRebalance',
            'COMPLETING_REBALANCE': 'CompletingRebalance',
            'STABLE': 'Stable',
            'DEAD': 'Dead',
            'EMPTY': 'Empty',
        };

        const members: ConsumerGroupMember[] = groupOrNull
            ? Array.from(groupOrNull.members.values()).map((m: any) => ({
                memberId: m.id,
                clientId: m.clientId,
                clientHost: m.clientHost,
            }))
            : [];

        return {
            groupId,
            state: groupOrNull ? (stateMap[groupOrNull.state] || 'Unknown') : 'Unknown',
            protocolType: groupOrNull?.protocolType || '',
            protocol: groupOrNull?.protocol || '',
            members,
            offsets: consumerGroupOffsets,
        };
    }

    async deleteConsumerGroups(groupIds: string[]): Promise<void> {
        const admin = await this.getKafkaAdminClient();
        await admin.deleteGroups({ groups: groupIds });
    }

    async createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        const admin = await this.getKafkaAdminClient();
        await admin.createTopics({
            topics: [createTopicRequest.topic],
            partitions: createTopicRequest.partitions,
            replicas: createTopicRequest.replicationFactor,
        });
        return [];
    }

    async deleteTopic(deleteTopicRequest: DeleteTopicRequest): Promise<void> {
        const admin = await this.getKafkaAdminClient();
        await admin.deleteTopics({
            topics: deleteTopicRequest.topics,
        });
    }

    async deleteTopicRecords(topic: string, partitions: PartitionOffset[]): Promise<void> {
        const admin = await this.getKafkaAdminClient();
        await admin.deleteRecords({
            topics: [{
                name: topic,
                partitions: partitions.map(p => ({
                    partition: p.partition,
                    offset: BigInt(p.offset),
                })),
            }],
        });
    }

    async fetchTopicPartitions(topic: string): Promise<number[]> {
        const admin = await this.getKafkaAdminClient();
        const metadata = await admin.metadata({ topics: [topic] } as any);
        const topicMeta = metadata.topics.get(topic);
        if (!topicMeta) {
            return [0];
        }
        return Array.from({ length: topicMeta.partitionsCount }, (_, i) => i);
    }

    async fetchTopicOffsets(topic: string): Promise<TopicPartitionOffsets[]> {
        const admin = await this.getKafkaAdminClient();
        const partitions = await this.fetchTopicPartitions(topic);

        const latestOffsets = await admin.listOffsets({
            topics: [{
                name: topic,
                partitions: partitions.map(p => ({ partitionIndex: p, timestamp: -1n })),
            }],
        });
        const earliestOffsets = await admin.listOffsets({
            topics: [{
                name: topic,
                partitions: partitions.map(p => ({ partitionIndex: p, timestamp: -2n })),
            }],
        });

        const latestByPartition = new Map(
            latestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []
        );
        const earliestByPartition = new Map(
            earliestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []
        );

        return partitions.map(p => ({
            partition: p,
            offset: latestByPartition.get(p)?.toString() ?? '0',
            high: latestByPartition.get(p)?.toString() ?? '0',
            low: earliestByPartition.get(p)?.toString() ?? '0',
        }));
    }

    async fetchTopicOffsetsByTimestamp(topic: string, timestamp: string): Promise<PartitionOffset[]> {
        const admin = await this.getKafkaAdminClient();
        const partitions = await this.fetchTopicPartitions(topic);
        const ts = BigInt(timestamp);

        const result = await admin.listOffsets({
            topics: [{
                name: topic,
                partitions: partitions.map(p => ({ partitionIndex: p, timestamp: ts })),
            }],
        });

        return result[0]?.partitions.map(p => ({
            partition: p.partitionIndex,
            offset: p.offset.toString(),
        })) ?? [];
    }

    dispose() {
        try {
            if (this.adminClient) {
                this.adminClient.close();
            }
        } finally {
            if (this.producerClient) {
                this.producerClient.close();
            }
        }
    }

}

export const createClient = (cluster: Cluster, _workspaceSettings: WorkspaceSettings): Client => new EnsureConnectedDecorator(
    new PlatformaticClient(cluster));

export const createKafkaConfig = async (connectionOptions: ConnectionOptions): Promise<PlatformaticClientConfig> => {
    const provider = getClusterProvider(connectionOptions.clusterProviderId);
    if (!provider) {
        throw new Error(`Cannot find cluster provider for '${connectionOptions.clusterProviderId}' ID.`);
    }
    const kafkaConfig = await provider.createKafkaConfig(connectionOptions);
    if (kafkaConfig) {
        return convertToClientConfig(kafkaConfig);
    }
    return createDefaultKafkaConfig(connectionOptions);
};

export function convertToClientConfig(config: KafkaClientConfig): PlatformaticClientConfig {
    const result: PlatformaticClientConfig = {
        clientId: config.clientId || "vscode-kafka",
        bootstrapBrokers: config.brokers,
    };
    if (config.ssl) {
        result.tls = typeof config.ssl === 'boolean' ? {} : config.ssl;
    }
    if (config.sasl) {
        const { mechanism, ...rest } = config.sasl;
        result.sasl = {
            ...rest,
            mechanism: mechanism.toUpperCase(),
        };
    }
    if (config.connectionTimeout !== undefined) { result.connectTimeout = config.connectionTimeout; }
    if (config.requestTimeout !== undefined) { result.requestTimeout = config.requestTimeout; }
    return result;
}

/**
 * Builds the consumer config by merging the base client config with consumer-specific
 * options. Only includes optional values that are explicitly defined to avoid overriding
 * @platformatic/kafka defaults with undefined.
 */
export function buildConsumerConfig(clientConfig: PlatformaticClientConfig, config: ConsumerConfig): Record<string, any> {
    const result: Record<string, any> = {
        ...clientConfig,
        groupId: config.groupId,
    };
    if (config.sessionTimeout !== undefined) { result.sessionTimeout = config.sessionTimeout; }
    if (config.rebalanceTimeout !== undefined) { result.rebalanceTimeout = config.rebalanceTimeout; }
    if (config.heartbeatInterval !== undefined) { result.heartbeatInterval = config.heartbeatInterval; }
    if (config.minBytes !== undefined) { result.minBytes = config.minBytes; }
    if (config.maxBytes !== undefined) { result.maxBytes = config.maxBytes; }
    if (config.maxWaitTimeInMs !== undefined) { result.maxWaitTime = config.maxWaitTimeInMs; }
    if (config.retry?.retries !== undefined) { result.retries = config.retry.retries; }
    return result;
}

export const createDefaultKafkaConfig = (connectionOptions: ConnectionOptions): PlatformaticClientConfig => {
    const result: PlatformaticClientConfig = {
        clientId: "vscode-kafka",
        bootstrapBrokers: connectionOptions.bootstrap.split(","),
    };

    const sasl = createSaslOption(connectionOptions);
    if (sasl) {
        result.sasl = sasl;
    }

    const tls = createTls(connectionOptions);
    if (tls) {
        result.tls = tls;
    }

    return result;
};

export const createDefaultExternalKafkaConfig = (connectionOptions: ConnectionOptions): KafkaClientConfig => {
    return {
        clientId: "vscode-kafka",
        brokers: connectionOptions.bootstrap.split(","),
    };
};

/**
 * Creates the appropriate KafkaJS SASL options based on the mechanism.
 */
function createSaslOption(connectionOptions: ConnectionOptions): Record<string, unknown> | undefined {
    const sasl = connectionOptions.saslOption;
    if (!sasl) {
        return undefined;
    }

    switch (sasl.mechanism) {
        case 'plain':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'PLAIN',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;

        case 'scram-sha-256':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'SCRAM-SHA-256',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;

        case 'scram-sha-512':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'SCRAM-SHA-512',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;

        case 'oauthbearer':
            if (sasl.oauthTokenEndpoint && sasl.oauthClientId && sasl.oauthClientSecret) {
                return {
                    mechanism: 'OAUTHBEARER',
                    token: createOAuthBearerProvider(
                        sasl.oauthTokenEndpoint,
                        sasl.oauthClientId,
                        sasl.oauthClientSecret
                    )
                };
            }
            break;

        case 'aws':
            if (sasl.awsRegion && sasl.awsAccessKeyId && sasl.awsSecretAccessKey) {
                return {
                    mechanism: 'OAUTHBEARER',
                    authenticate: createAwsMskIamAuthenticator(
                        sasl.awsRegion,
                        sasl.awsAccessKeyId,
                        sasl.awsSecretAccessKey,
                        sasl.awsSessionToken
                    )
                };
            }
            break;
    }

    return undefined;
}

/**
 * Creates an OAuth Bearer token provider that fetches tokens from an OAuth endpoint.
 * The provider handles token requests using the client credentials grant type.
 */
function createOAuthBearerProvider(
    tokenEndpoint: string,
    clientId: string,
    clientSecret: string
): () => Promise<string> {
    let cachedToken: { value: string; expiresAt: number } | undefined;

    return async () => {
        const now = Date.now();
        
        if (cachedToken && cachedToken.expiresAt > now + 60000) {
            return cachedToken.value;
        }

        try {
            const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const contentTypeHeader = 'Content-Type';
            const authorizationHeader = 'Authorization';
            const response = await fetchWithRetry(tokenEndpoint, {
                method: 'POST',
                headers: {
                    [contentTypeHeader]: 'application/x-www-form-urlencoded',
                    [authorizationHeader]: `Basic ${credentials}`
                },
                body: 'grant_type=client_credentials'
            }, { timeoutMs: 10000, retries: 2, backoffMs: 500 });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OAuth token request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const tokenResponse = await response.json() as Record<string, unknown>;
            const accessToken = typeof tokenResponse['access_token'] === 'string' ? tokenResponse['access_token'] : undefined;
            
            if (!accessToken) {
                throw new Error('OAuth response did not contain access_token');
            }

            const expiresInValue = tokenResponse['expires_in'];
            const expiresIn = typeof expiresInValue === 'number' ? expiresInValue : 3600;
            cachedToken = {
                value: accessToken,
                expiresAt: now + (expiresIn * 1000)
            };

            return accessToken;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to obtain OAuth token: ${message}`);
        }
    };
}

/**
 * Generates an AWS SigV4-signed token for MSK IAM authentication.
 * The token is a base64-encoded JSON payload containing the signed request parameters.
 */
async function generateAwsMskIamToken(
    host: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string,
    now?: Date
): Promise<string> {
    const serviceName = 'kafka-cluster';
    const timestamp = now ?? new Date();
    const dateStamp = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');

    const queryParamsObj: Record<string, string> = {
        'Action': 'kafka-cluster:Connect',
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${accessKeyId}/${dateStamp}/${region}/${serviceName}/aws4_request`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': '900',
        'X-Amz-SignedHeaders': 'host',
    };

    if (sessionToken) {
        queryParamsObj['X-Amz-Security-Token'] = sessionToken;
    }

    // SigV4 requires lexicographically sorted query parameters
    const canonicalQueryString = new URLSearchParams(
        Object.entries(queryParamsObj).sort(([a], [b]) => a.localeCompare(b))
    ).toString();

    const canonicalRequest = [
        'GET',
        '/',
        canonicalQueryString,
        `host:${host}`,
        '',
        'host',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ].join('\n');

    const { createHmac, createHash } = await import('crypto');
    const hash = (data: string) => createHash('sha256').update(data).digest('hex');
    const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

    const credentialScope = `${dateStamp}/${region}/${serviceName}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        hash(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, serviceName);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return Buffer.from(JSON.stringify({
        version: '2020_10_22',
        host,
        'user-agent': 'vscode-kafka',
        action: 'kafka-cluster:Connect',
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
        'x-amz-credential': `${accessKeyId}/${credentialScope}`,
        'x-amz-date': amzDate,
        'x-amz-signedheaders': 'host',
        'x-amz-expires': '900',
        'x-amz-signature': signature,
        ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
    })).toString('base64');
}

/**
 * Creates an AWS MSK IAM authenticator compatible with @platformatic/kafka's
 * SASLCustomAuthenticator interface. Extracts the broker host from the connection,
 * generates a SigV4-signed token, and sends it as OAUTHBEARER auth bytes.
 */
function createAwsMskIamAuthenticator(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string
): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
        const connection = args[1] as { host?: string } | undefined;
        const authenticateAPI = args[2] as (conn: unknown, authBytes: Buffer, cb: (err: Error | null, res?: unknown) => void) => void;
        const callback = args[6] as (err: Error | null, res?: unknown) => void;

        const host = connection?.host;
        if (!host) {
            callback(new Error('AWS MSK IAM auth failed: broker host not available on connection'));
            return;
        }

        generateAwsMskIamToken(host, region, accessKeyId, secretAccessKey, sessionToken)
            .then(token => {
                const authBytes = Buffer.from(`n,,\x01auth=Bearer ${token}\x01\x01`);
                authenticateAPI(connection, authBytes, callback);
            })
            .catch(error => {
                callback(error instanceof Error ? error : new Error(String(error)));
            });
    };
}

async function fetchWithRetry(url: string, init: RequestInit, options: { timeoutMs: number; retries: number; backoffMs: number }): Promise<Response> {
    let attempt = 0;
    while (true) {
        try {
            const response = await fetchWithTimeout(url, init, options.timeoutMs);
            if (response.ok || response.status < 500 || attempt >= options.retries) {
                return response;
            }
            response.body?.cancel?.();
        } catch (error) {
            if (attempt >= options.retries) {
                throw error;
            }
        }
        attempt += 1;
        await delay(options.backoffMs * attempt);
    }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createTls(connectionOptions: ConnectionOptions): Record<string, unknown> | undefined {
    if (connectionOptions.ssl) {
        const sslOption = connectionOptions.ssl;
        if (typeof sslOption === 'boolean') {
            return {};
        }
        const ca = createCaCertificates(sslOption);
        const key = sslOption.key ? fs.readFileSync(sslOption.key) : undefined;
        const cert = sslOption.cert ? fs.readFileSync(sslOption.cert) : undefined;
        const result: Record<string, unknown> = {};
        if (ca) { result.ca = ca; }
        if (key) { result.key = key; }
        if (cert) { result.cert = cert; }
        if (sslOption.passphrase) { result.passphrase = sslOption.passphrase; }
        if (sslOption.rejectUnauthorized !== undefined) { result.rejectUnauthorized = sslOption.rejectUnauthorized; }
        return result;
    }
    return undefined;
}

interface TruststorePemEntry {
    ca?: string;
    cert?: string;
    key?: string;
}

function createCaCertificates(sslOption: SslOption): Buffer | string | Array<Buffer | string> | undefined {
    const caCertificates: Array<Buffer | string> = [];
    if (sslOption.ca) {
        caCertificates.push(fs.readFileSync(sslOption.ca));
    }

    if (sslOption.truststore) {
        const truststoreCertificates = readTruststoreCertificates(sslOption.truststore, sslOption.truststorePassword);
        caCertificates.push(...truststoreCertificates);
    }

    if (caCertificates.length === 0) {
        return undefined;
    }
    if (caCertificates.length === 1) {
        return caCertificates[0];
    }
    return caCertificates;
}

function readTruststoreCertificates(truststorePath: string, truststorePassword?: string): string[] {
    if (!truststorePassword) {
        throw new Error(`A truststore password is required for '${truststorePath}'.`);
    }

    const truststoreContent = fs.readFileSync(truststorePath);
    const entries = jks.toPem(truststoreContent, truststorePassword) as Record<string, TruststorePemEntry>;
    const certificates = extractCertificatesFromTruststoreEntries(entries);
    if (certificates.length === 0) {
        throw new Error(`No CA certificates were found in truststore '${truststorePath}'.`);
    }
    return certificates;
}

function extractCertificatesFromTruststoreEntries(entries: Record<string, TruststorePemEntry>): string[] {
    return Object.values(entries)
        .map(entry => entry.ca || entry.cert)
        .filter((certificate): certificate is string => !!certificate);
}

export const clientTestHooks = {
    extractCertificatesFromTruststoreEntries,
    generateAwsMskIamToken,
    createAwsMskIamAuthenticator,
    createSaslOption,
};

export function addQueryParameter(query: string, name: string, value?: string): string {
    if (value === undefined) {
        return query;
    }
    return `${query}${query.length > 0 ? '&' : '?'}${name}=${value}`;
}

export function isVisible(t: Topic): boolean {
    const settings = getWorkspaceSettings();
    const filters = settings.topicFilters;
    if (!filters) {
        return true;
    }
    const id = t.id.toLowerCase();
    return !filters.find(f => minimatch(id, f));
}

export function sortTopics(topics: Topic[]): Topic[] {
    const settings = getWorkspaceSettings();
    switch (settings.topicSortOption) {
        case TopicSortOption.name:
            topics = topics.sort(sortByNameAscending);
            break;
        case TopicSortOption.partitions:
            topics = topics.sort(sortByPartitionsAscending);
    }
    return topics;
}

function sortByNameAscending(a: Topic, b: Topic): -1 | 0 | 1 {
    if (a.id.toLowerCase() < b.id.toLowerCase()) { return -1; }
    if (a.id.toLowerCase() > b.id.toLowerCase()) { return 1; }
    return 0;
}

function sortByPartitionsAscending(a: Topic, b: Topic): -1 | 0 | 1 {
    if (a.partitionCount < b.partitionCount) { return -1; }
    if (a.partitionCount > b.partitionCount) { return 1; }
    return 0;
}
