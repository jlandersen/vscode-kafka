import { Admin, ConfigResourceTypes, Consumer, ConsumerConfig, Kafka, KafkaConfig, Producer, SeekEntry } from "kafkajs";

import { Disposable } from "vscode";
import { ClientAccessor, ClientState } from ".";
import { getClusterProvider } from "../kafka-extensions/registry";
import { WorkspaceSettings } from "../settings";

export interface ConnectionOptions {
    clusterProviderId?: string;
    bootstrap: string;
    saslOption?: SaslOption;
    ssl?: boolean;
}

export interface Cluster extends ConnectionOptions {
    id: string;
    name: string;
}

/**
 * The supported SASL mechanisms for authentication.
 */
export type SaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512";

export interface SaslOption {
    mechanism: SaslMechanism;
    username?: string;
    password?: string;
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
    configValue: string;
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
}

export interface ConsumerGroupMember {
    memberId: string;
    clientId: string;
    clientHost: string;
}

export interface Client extends Disposable {
    state: ClientState;
    cluster: Cluster;
    producer(): Promise<Producer>;
    consumer(config?: ConsumerConfig): Promise<Consumer>;
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
    fetchTopicPartitions(topic: string): Promise<number[]>;
    fetchTopicOffsets(topic: string): Promise<Array<SeekEntry & { high: string; low: string }>>;
}

class EnsureConnectedDecorator implements Client {
    public state = ClientState.disconnected;

    constructor(private client: Client) {
    }

    get cluster(): Cluster {
        return this.client.cluster;
    }

    public async producer(): Promise<Producer> {
        await this.waitUntilConnected();
        return await this.client.producer();
    }

    public async consumer(config?: ConsumerConfig): Promise<Consumer> {
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

    public async fetchTopicPartitions(topic: string): Promise<number[]> {
        await this.waitUntilConnected();
        return await this.client.fetchTopicPartitions(topic);
    }

    public async fetchTopicOffsets(topic: string): Promise<Array<SeekEntry & { high: string; low: string }>> {
        await this.waitUntilConnected();
        return await this.client.fetchTopicOffsets(topic);
    }

    public dispose(): void {
        return this.client.dispose();
    }

    private async waitUntilConnected(): Promise<void> {
        const clientAccessor = ClientAccessor.getInstance();
        try {
            clientAccessor.changeState(this, ClientState.connecting);
            await this.client.connect();
            clientAccessor.changeState(this, ClientState.connected);
        } catch (error) {
            clientAccessor.changeState(this, ClientState.invalid);
            if (error.message) {
                throw new Error(`Failed operation - ${error.message}`);
            } else {
                throw new Error(`Failed operation`);
            }
        }
    }
}

class KafkaJsClient implements Client {
    private kafkaJsClient: Kafka | undefined;
    private kafkaProducer: Producer | undefined;
    private kafkaAdminClient: Admin | undefined;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    // Promise which returns the KafkaJsClient instance when it is ready.
    private kafkaPromise: Promise<KafkaJsClient>;
    
    constructor(public readonly cluster: Cluster, workspaceSettings: WorkspaceSettings) {
        this.metadata = {
            brokers: [],
            topics: [],
        };
        // The Kafka client is created in asynchronous since external vscode extension
        // can contribute to the creation of Kafka instance.
        this.kafkaPromise = createKafka(cluster)
            .then(result => {
                this.kafkaJsClient = result;
                this.kafkaAdminClient = this.kafkaJsClient.admin();
                this.kafkaProducer = this.kafkaJsClient.producer();
                return this;
            });
    }


    public get state(): ClientState {
        return ClientState.disconnected;
    }

    private async getkafkaClient(): Promise<Kafka> {
        const client = (await this.kafkaPromise).kafkaJsClient;
        if (!client) {
            throw new Error('Kafka client cannot be null.');
        }
        return client;
    }

    private async getkafkaAdminClient(): Promise<Admin> {
        const admin = (await this.kafkaPromise).kafkaAdminClient;
        if (!admin) {
            throw new Error('Kafka Admin cannot be null.');
        }
        return admin;
    }

    public async producer(): Promise<Producer> {
        if (this.kafkaProducer) {
            return this.kafkaProducer;
        }
        const producer = (await this.kafkaPromise).kafkaProducer;
        if (!producer) {
            throw new Error('Producer cannot be null.');
        }
        return producer;
    }

    public async consumer(config?: ConsumerConfig): Promise<Consumer> {
        return (await this.getkafkaClient()).consumer(config);
    }

    async connect(): Promise<void> {
        return (await this.getkafkaAdminClient()).connect();
    }

    async getTopics(): Promise<Topic[]> {
        const listTopicsResponse = await (await this.getkafkaAdminClient()).fetchTopicMetadata();

        this.metadata = {
            ...this.metadata,
            topics: listTopicsResponse.topics.map((t) => {
                const partitions = t.partitions.reduce((prev, p) => ({
                    ...prev, [p.partitionId.toString()]: {
                        partition: p.partitionId.toString(),
                        leader: p.leader.toString(),
                        replicas: p.replicas.map((r) => (r.toString())),
                        isr: p.isr.map((r) => (r.toString())),
                    }
                }), {});

                return {
                    id: t.name,
                    partitionCount: t.partitions.length,
                    partitions: partitions,
                    replicationFactor: t.partitions[0].replicas.length,
                };
            }),
        };

        return this.metadata.topics;
    }

    async getBrokers(): Promise<Broker[]> {
        const describeClusterResponse = await (await this.getkafkaAdminClient()).describeCluster();

        this.metadata = {
            ...this.metadata,
            brokers: describeClusterResponse.brokers.map((b) => {
                return {
                    id: b.nodeId.toString(),
                    host: b.host,
                    port: b.port,
                    isController: b.nodeId === describeClusterResponse.controller,
                };
            }),
        };

        return Promise.resolve(this.metadata.brokers);
    }

    async getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        const describeConfigsResponse = await (await this.getkafkaAdminClient()).describeConfigs({
            includeSynonyms: false,
            resources: [
                {
                    type: ConfigResourceTypes.BROKER,
                    name: brokerId,
                },
            ],
        });

        return describeConfigsResponse.resources[0].configEntries;
    }

    async getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        const describeConfigsResponse = await (await this.getkafkaAdminClient()).describeConfigs({
            includeSynonyms: false,
            resources: [
                {
                    type: ConfigResourceTypes.TOPIC,
                    name: topicId,
                },
            ],
        });

        return describeConfigsResponse.resources[0].configEntries;
    }

    async getConsumerGroupIds(): Promise<string[]> {
        const listGroupsResponse = await (await this.getkafkaAdminClient()).listGroups();
        return Promise.resolve(listGroupsResponse.groups.map((g) => (g.groupId)));
    }

    async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        const describeGroupResponse = await (await this.getkafkaAdminClient()).describeGroups([groupId]);

        const consumerGroup: ConsumerGroup = {
            groupId: groupId,
            state: describeGroupResponse.groups[0].state,
            protocolType: describeGroupResponse.groups[0].protocolType,
            protocol: describeGroupResponse.groups[0].protocol,
            members: describeGroupResponse.groups[0].members.map((m) => {
                return {
                    memberId: m.memberId,
                    clientId: m.clientId,
                    clientHost: m.clientHost,
                };
            }),
        };

        return consumerGroup;
    }

    async deleteConsumerGroups(groupIds: string[]): Promise<void> {
        await (await this.getkafkaAdminClient()).deleteGroups(groupIds);
    }

    async createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        await (await this.getkafkaAdminClient()).createTopics({
            validateOnly: false,
            waitForLeaders: true,
            topics: [{
                topic: createTopicRequest.topic,
                numPartitions: createTopicRequest.partitions,
                replicationFactor: createTopicRequest.replicationFactor,
            }],
        });
        return Promise.resolve([]);
    }

    async deleteTopic(deleteTopicRequest: DeleteTopicRequest): Promise<void> {
        return await (await this.getkafkaAdminClient()).deleteTopics({
            topics: deleteTopicRequest.topics,
            timeout: deleteTopicRequest.timeout
        });
    }

    async fetchTopicPartitions(topic: string): Promise<number[]> {
        // returns the topics partitions
        const partitionMetadata = await (await this.getkafkaAdminClient()).fetchTopicMetadata({ topics: [topic] });
        return partitionMetadata?.topics[0].partitions.map(m => m.partitionId) || [0];
    }

    async fetchTopicOffsets(topic: string): Promise<Array<SeekEntry & { high: string; low: string }>> {
        // returns the topics partitions
        return (await this.getkafkaAdminClient()).fetchTopicOffsets(topic);
    }

    dispose() {
        if (this.kafkaAdminClient) {
            this.kafkaAdminClient.disconnect();
        }
    }
    
}

export const createClient = (cluster: Cluster, workspaceSettings: WorkspaceSettings): Client => new EnsureConnectedDecorator(
    new KafkaJsClient(cluster, workspaceSettings));

export const createKafka = async (connectionOptions: ConnectionOptions): Promise<Kafka> => {
    const provider = getClusterProvider(connectionOptions.clusterProviderId);
    if (!provider) {
        throw new Error(`Cannot find cluster provider for '${connectionOptions.clusterProviderId}' ID.`);
    }
    const kafkaConfig = await provider.createKafkaConfig(connectionOptions) || createDefaultKafkaConfig(connectionOptions);
    return new Kafka(kafkaConfig);
};

export const createDefaultKafkaConfig = (connectionOptions: ConnectionOptions): KafkaConfig => {
    if (connectionOptions.saslOption && connectionOptions.saslOption.username && connectionOptions.saslOption.password) {
        return {
            clientId: "vscode-kafka",
            brokers: connectionOptions.bootstrap.split(","),
            ssl: true,
            sasl: { mechanism: connectionOptions.saslOption.mechanism, username: connectionOptions.saslOption.username, password: connectionOptions.saslOption.password },
        };
    }
    return {
        clientId: "vscode-kafka",
        brokers: connectionOptions.bootstrap.split(","),
        ssl: connectionOptions.ssl
    };
};

export function addQueryParameter(query: string, name: string, value?: string): string {
    if (value === undefined) {
        return query;
    }
    return `${query}${query.length > 0 ? '&' : '?'}${name}=${value}`;
}
