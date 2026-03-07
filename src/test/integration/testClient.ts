/**
 * Test-specific Kafka client that bypasses extension context dependencies.
 * 
 * This module provides a way to create Kafka clients for integration tests
 * without requiring VS Code extension context (globalState, etc.).
 */

import { Admin, Producer, Consumer, ConfigResourceTypes } from "@platformatic/kafka";
import { Broker, Client, Cluster, ConfigEntry, ConsumerGroup, ConsumerGroupMember, ConsumerGroupOffset, CreateTopicRequest, DeleteTopicRequest, PlatformaticProducerAdapter, PlatformaticConsumerAdapter, SaslOption, Topic, TopicPartition } from "../../client/client";
import { ClientState } from "../../client";
import { PartitionOffset, TopicPartitionOffsets } from "../../client/types";
import { KafkaConnectionInfo, SslConnectionInfo } from "./kafkaContainers";

function createTlsOption(ssl?: SslConnectionInfo): Record<string, unknown> | undefined {
    if (!ssl) {
        return undefined;
    }

    const tlsConfig: Record<string, unknown> = {
        rejectUnauthorized: false,
    };

    if (ssl.ca) {
        tlsConfig.ca = [ssl.ca];
    }
    if (ssl.cert) {
        tlsConfig.cert = ssl.cert;
    }
    if (ssl.key) {
        tlsConfig.key = ssl.key;
    }
    if (ssl.passphrase) {
        tlsConfig.passphrase = ssl.passphrase;
    }

    return tlsConfig;
}

function createSaslOption(sasl?: SaslOption): Record<string, unknown> | undefined {
    if (!sasl) {
        return undefined;
    }

    switch (sasl.mechanism) {
        case 'plain':
            if (sasl.username && sasl.password) {
                return { mechanism: 'PLAIN', username: sasl.username, password: sasl.password };
            }
            break;
        case 'scram-sha-256':
            if (sasl.username && sasl.password) {
                return { mechanism: 'SCRAM-SHA-256', username: sasl.username, password: sasl.password };
            }
            break;
        case 'scram-sha-512':
            if (sasl.username && sasl.password) {
                return { mechanism: 'SCRAM-SHA-512', username: sasl.username, password: sasl.password };
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

    private admin: Admin | null = null;
    private clientConfig: Record<string, unknown>;
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

        this.clientConfig = {
            clientId: "vscode-kafka-test",
            bootstrapBrokers: connectionInfo.bootstrap.split(","),
            sasl: createSaslOption(connectionInfo.saslOption),
            tls: createTlsOption(connectionInfo.sslOption),
            timeout: 30000,
            connectTimeout: 10000,
        };
    }

    async connect(): Promise<void> {
        this.state = ClientState.connecting;
        try {
            this.admin = new Admin(this.clientConfig as any);

            // Retry metadata until brokers are available (testcontainers may not be fully ready)
            for (let attempt = 0; attempt < 30; attempt++) {
                this.admin.clearMetadata();
                const metadata = await this.admin.metadata({} as any);
                this.metadata.brokers = Array.from(metadata.brokers.entries()).map(([nodeId, b]) => ({
                    id: String(nodeId),
                    host: b.host,
                    port: b.port,
                    isController: nodeId === metadata.controllerId,
                }));
                if (this.metadata.brokers.length > 0) {
                    break;
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            this.state = ClientState.connected;
        } catch (error) {
            this.state = ClientState.invalid;
            throw error;
        }
    }

    async producer(): Promise<any> {
        return new PlatformaticProducerAdapter(new Producer(this.clientConfig as any));
    }

    async consumer(config?: any): Promise<any> {
        const consumer = new Consumer({
            ...this.clientConfig,
            groupId: config?.groupId || "test-consumer",
            retries: 10,
        } as any);
        return new PlatformaticConsumerAdapter(consumer);
    }

    async getTopics(): Promise<Topic[]> {
        const admin = await this.getAdmin();
        const topicNames = await admin.listTopics();
        if (topicNames.length === 0) {
            return [];
        }

        const metadata = await admin.metadata({ topics: topicNames } as any);

        return Array.from(metadata.topics.entries()).map(([name, topicMeta]) => {
            const partitions: { [id: string]: TopicPartition } = {};
            topicMeta.partitions.forEach((p, index) => {
                partitions[index.toString()] = {
                    partition: index.toString(),
                    isr: p.isr.map(String),
                    replicas: p.replicas.map(String),
                    leader: String(p.leader),
                };
            });

            return {
                id: name,
                partitionCount: topicMeta.partitionsCount,
                replicationFactor: topicMeta.partitions[0]?.replicas.length || 0,
                partitions,
            };
        });
    }

    async getBrokers(): Promise<Broker[]> {
        return this.metadata.brokers;
    }

    async getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        const admin = await this.getAdmin();
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
        const admin = await this.getAdmin();
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
        const admin = await this.getAdmin();
        const groups = await admin.listGroups();
        return Array.from(groups.keys());
    }

    async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        const admin = await this.getAdmin();
        const groupsMap = await admin.describeGroups({ groups: [groupId] });
        const group = groupsMap.get(groupId);
        if (!group) {
            throw new Error(`Consumer group '${groupId}' not found`);
        }

        const offsetsResult = await admin.listConsumerGroupOffsets({ groups: [groupId] });
        const groupOffsets = offsetsResult[0];
        const offsets: ConsumerGroupOffset[] = [];

        for (const topicOffsets of groupOffsets.topics) {
            for (const partition of topicOffsets.partitions) {
                offsets.push({
                    topic: topicOffsets.name,
                    partition: partition.partitionIndex,
                    start: "0",
                    end: "0",
                    offset: partition.committedOffset.toString(),
                    lag: "0",
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

        return {
            groupId,
            state: stateMap[group.state] || 'Unknown',
            protocol: group.protocol || '',
            protocolType: group.protocol || '',
            members: Array.from(group.members.values()).map((m): ConsumerGroupMember => ({
                memberId: m.id,
                clientId: m.clientId,
                clientHost: m.clientHost,
            })),
            offsets,
        };
    }

    async deleteConsumerGroups(groupIds: string[]): Promise<void> {
        const admin = await this.getAdmin();
        await admin.deleteGroups({ groups: groupIds });
    }

    async createTopic(request: CreateTopicRequest): Promise<any[]> {
        const admin = await this.getAdmin();
        await admin.createTopics({
            topics: [request.topic],
            partitions: request.partitions,
            replicas: request.replicationFactor,
        });
        return [];
    }

    async deleteTopic(request: DeleteTopicRequest): Promise<void> {
        const admin = await this.getAdmin();
        await admin.deleteTopics({ topics: request.topics });
    }

    async deleteTopicRecords(topic: string, partitions: PartitionOffset[]): Promise<void> {
        const admin = await this.getAdmin();
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
        const admin = await this.getAdmin();
        const metadata = await admin.metadata({ topics: [topic] } as any);
        const topicMeta = metadata.topics.get(topic);
        if (!topicMeta) {
            return [0];
        }
        return Array.from({ length: topicMeta.partitionsCount }, (_, i) => i);
    }

    async fetchTopicOffsets(topic: string): Promise<TopicPartitionOffsets[]> {
        const admin = await this.getAdmin();
        const partitions = await this.fetchTopicPartitions(topic);

        const latestOffsets = await admin.listOffsets({
            topics: [{ name: topic, partitions: partitions.map(p => ({ partitionIndex: p, timestamp: -1n })) }],
        });
        const earliestOffsets = await admin.listOffsets({
            topics: [{ name: topic, partitions: partitions.map(p => ({ partitionIndex: p, timestamp: -2n })) }],
        });

        const latestByPartition = new Map(latestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []);
        const earliestByPartition = new Map(earliestOffsets[0]?.partitions.map(p => [p.partitionIndex, p.offset]) ?? []);

        return partitions.map(p => ({
            partition: p,
            offset: latestByPartition.get(p)?.toString() ?? '0',
            high: latestByPartition.get(p)?.toString() ?? '0',
            low: earliestByPartition.get(p)?.toString() ?? '0',
        }));
    }

    async fetchTopicOffsetsByTimestamp(topic: string, timestamp: string): Promise<PartitionOffset[]> {
        const admin = await this.getAdmin();
        const partitions = await this.fetchTopicPartitions(topic);
        const ts = BigInt(timestamp);

        const result = await admin.listOffsets({
            topics: [{ name: topic, partitions: partitions.map(p => ({ partitionIndex: p, timestamp: ts })) }],
        });

        return result[0]?.partitions.map(p => ({
            partition: p.partitionIndex,
            offset: p.offset.toString(),
        })) ?? [];
    }

    private async getAdmin(): Promise<Admin> {
        if (!this.admin) {
            throw new Error("Client not connected");
        }
        return this.admin;
    }

    dispose(): void {
        if (this.admin) {
            this.admin.close();
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
