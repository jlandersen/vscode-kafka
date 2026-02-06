/**
 * Test-specific Kafka client that bypasses extension context dependencies.
 * 
 * This module provides a way to create Kafka clients for integration tests
 * without requiring VS Code extension context (globalState, etc.).
 */

import { Admin, ConfigResourceTypes, Consumer, ConsumerConfig, Kafka, KafkaConfig, Producer, SASLOptions, SeekEntry } from "kafkajs";
import { Broker, Client, Cluster, ConfigEntry, ConsumerGroup, ConsumerGroupMember, ConsumerGroupOffset, CreateTopicRequest, DeleteTopicRequest, SaslOption, Topic, TopicPartition } from "../../client/client";
import { ClientState } from "../../client";
import { KafkaConnectionInfo, SslConnectionInfo } from "./kafkaContainers";

/**
 * Creates KafkaJS SSL options from SslConnectionInfo.
 */
function createSslOption(ssl?: SslConnectionInfo): KafkaConfig["ssl"] | undefined {
    if (!ssl) {
        return undefined;
    }

    const sslConfig: {
        rejectUnauthorized: boolean;
        ca?: string[];
        cert?: string;
        key?: string;
        passphrase?: string;
    } = {
        rejectUnauthorized: false,
    };

    if (ssl.ca) {
        sslConfig.ca = [ssl.ca];
    }
    if (ssl.cert) {
        sslConfig.cert = ssl.cert;
    }
    if (ssl.key) {
        sslConfig.key = ssl.key;
    }
    if (ssl.passphrase) {
        sslConfig.passphrase = ssl.passphrase;
    }

    return sslConfig;
}

/**
 * Creates a KafkaJS SASL options object from a SaslOption.
 */
function createSaslOption(sasl?: SaslOption): SASLOptions | undefined {
    if (!sasl) {
        return undefined;
    }

    switch (sasl.mechanism) {
        case 'plain':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'plain',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;

        case 'scram-sha-256':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'scram-sha-256',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;

        case 'scram-sha-512':
            if (sasl.username && sasl.password) {
                return {
                    mechanism: 'scram-sha-512',
                    username: sasl.username,
                    password: sasl.password
                };
            }
            break;
    }
    return undefined;
}

/**
 * A test-specific Kafka client that doesn't require VS Code extension context.
 */
export class TestKafkaClient implements Client {
    public state: ClientState = ClientState.disconnected;
    public cluster: Cluster;

    private kafka: Kafka;
    private admin: Admin | null = null;
    private metadata: {
        brokers: Broker[];
    } = { brokers: [] };

    constructor(connectionInfo: KafkaConnectionInfo, clusterId: string = "test-cluster") {
        this.cluster = {
            id: clusterId,
            name: `Test Cluster (${clusterId})`,
            bootstrap: connectionInfo.bootstrap,
            saslOption: connectionInfo.saslOption,
        };

        const kafkaConfig: KafkaConfig = {
            clientId: "vscode-kafka-test",
            brokers: connectionInfo.bootstrap.split(","),
            sasl: createSaslOption(connectionInfo.saslOption),
            ssl: createSslOption(connectionInfo.sslOption),
            connectionTimeout: 10000,
            requestTimeout: 30000,
        };

        this.kafka = new Kafka(kafkaConfig);
    }

    async connect(): Promise<void> {
        this.state = ClientState.connecting;
        try {
            this.admin = this.kafka.admin();
            await this.admin.connect();

            const clusterInfo = await this.admin.describeCluster();
            this.metadata.brokers = clusterInfo.brokers.map((b) => ({
                id: String(b.nodeId),
                host: b.host,
                port: b.port,
                isController: b.nodeId === clusterInfo.controller,
            }));

            this.state = ClientState.connected;
        } catch (error) {
            this.state = ClientState.invalid;
            throw error;
        }
    }

    async producer(): Promise<Producer> {
        const producer = this.kafka.producer();
        await producer.connect();
        return producer;
    }

    async consumer(config?: ConsumerConfig): Promise<Consumer> {
        const consumer = this.kafka.consumer(config || { groupId: "test-consumer" });
        await consumer.connect();
        return consumer;
    }

    async getTopics(): Promise<Topic[]> {
        const admin = await this.getAdmin();
        const topicMetadata = await admin.fetchTopicMetadata();
        
        return topicMetadata.topics.map((topic) => {
            const partitions: { [id: string]: TopicPartition } = {};
            topic.partitions.forEach((partition) => {
                partitions[partition.partitionId.toString()] = {
                    partition: partition.partitionId.toString(),
                    isr: partition.isr.map(String),
                    replicas: partition.replicas.map(String),
                    leader: String(partition.leader),
                };
            });

            return {
                id: topic.name,
                partitionCount: topic.partitions.length,
                replicationFactor: topic.partitions[0]?.replicas.length || 0,
                partitions,
            };
        });
    }

    async getBrokers(): Promise<Broker[]> {
        return this.metadata.brokers;
    }

    async getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        const admin = await this.getAdmin();
        const configs = await admin.describeConfigs({
            includeSynonyms: false,
            resources: [
                {
                    type: ConfigResourceTypes.BROKER,
                    name: brokerId,
                },
            ],
        });

        return configs.resources[0].configEntries.map((entry) => ({
            configName: entry.configName,
            configValue: entry.configValue,
        }));
    }

    async getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        const admin = await this.getAdmin();
        const configs = await admin.describeConfigs({
            includeSynonyms: false,
            resources: [
                {
                    type: ConfigResourceTypes.TOPIC,
                    name: topicId,
                },
            ],
        });

        return configs.resources[0].configEntries.map((entry) => ({
            configName: entry.configName,
            configValue: entry.configValue,
        }));
    }

    async getConsumerGroupIds(): Promise<string[]> {
        const admin = await this.getAdmin();
        const groups = await admin.listGroups();
        return groups.groups.map((g) => g.groupId);
    }

    async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        const admin = await this.getAdmin();
        const [description, offsets] = await Promise.all([
            admin.describeGroups([groupId]),
            this.getConsumerGroupOffsets(groupId),
        ]);

        const group = description.groups[0];
        return {
            groupId: group.groupId,
            state: group.state as ConsumerGroup["state"],
            protocol: group.protocol,
            protocolType: group.protocolType,
            members: group.members.map((m): ConsumerGroupMember => ({
                memberId: m.memberId,
                clientId: m.clientId,
                clientHost: m.clientHost,
            })),
            offsets,
        };
    }

    private async getConsumerGroupOffsets(groupId: string): Promise<ConsumerGroupOffset[]> {
        const admin = await this.getAdmin();
        const offsets = await admin.fetchOffsets({ groupId });
        const result: ConsumerGroupOffset[] = [];

        for (const topicOffset of offsets) {
            for (const partition of topicOffset.partitions) {
                result.push({
                    topic: topicOffset.topic,
                    partition: partition.partition,
                    start: "0",
                    end: "0",
                    offset: partition.offset,
                    lag: "0",
                });
            }
        }

        return result;
    }

    async deleteConsumerGroups(groupIds: string[]): Promise<void> {
        const admin = await this.getAdmin();
        await admin.deleteGroups(groupIds);
    }

    async createTopic(request: CreateTopicRequest): Promise<any[]> {
        const admin = await this.getAdmin();
        await admin.createTopics({
            topics: [
                {
                    topic: request.topic,
                    numPartitions: request.partitions,
                    replicationFactor: request.replicationFactor,
                },
            ],
        });
        return [];
    }

    async deleteTopic(request: DeleteTopicRequest): Promise<void> {
        const admin = await this.getAdmin();
        await admin.deleteTopics({
            topics: request.topics,
            timeout: request.timeout,
        });
    }

    async deleteTopicRecords(topic: string, partitions: SeekEntry[]): Promise<void> {
        const admin = await this.getAdmin();
        await admin.deleteTopicRecords({
            topic,
            partitions,
        });
    }

    async fetchTopicPartitions(topic: string): Promise<number[]> {
        const admin = await this.getAdmin();
        const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
        return metadata.topics[0].partitions.map((p) => p.partitionId);
    }

    async fetchTopicOffsets(topic: string): Promise<Array<SeekEntry & { high: string; low: string }>> {
        const admin = await this.getAdmin();
        return admin.fetchTopicOffsets(topic);
    }

    private async getAdmin(): Promise<Admin> {
        if (!this.admin) {
            throw new Error("Client not connected");
        }
        return this.admin;
    }

    dispose(): void {
        if (this.admin) {
            this.admin.disconnect();
            this.admin = null;
        }
        this.state = ClientState.disconnected;
    }
}

/**
 * Creates a test Kafka client from connection info.
 */
export function createTestClient(connectionInfo: KafkaConnectionInfo, clusterId?: string): TestKafkaClient {
    return new TestKafkaClient(connectionInfo, clusterId);
}
