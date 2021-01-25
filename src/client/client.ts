import { Admin, ConfigResourceTypes, Kafka, Producer } from "kafkajs";

import { Disposable } from "vscode";
import { WorkspaceSettings } from "../settings";

export interface ConnectionOptions {
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
    cluster: Cluster;
    producer: Producer;
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
}

class EnsureConnectedDecorator implements Client {

    constructor(private client: Client) {
    }

    get cluster(): Cluster {
        return this.client.cluster;
    }

    get producer(): any {
        return this.client.producer;
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

    public dispose(): void {
        return this.client.dispose();
    }

    private async waitUntilConnected(): Promise<void> {
        try {
            await this.client.connect();
        } catch (error) {
            if (error.message) {
                throw new Error(`Failed operation - ${error.message}`);
            } else {
                throw new Error(`Failed operation`);
            }
        }
    }
}

class KafkaJsClient implements Client {
    public kafkaClient: any;
    public kafkaCyclicProducerClient: any;
    public kafkaKeyedProducerClient: any;
    public producer: Producer;

    private kafkaJsClient: Kafka;
    private kafkaAdminClient: Admin;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    constructor(public readonly cluster: Cluster, workspaceSettings: WorkspaceSettings) {
        this.metadata = {
            brokers: [],
            topics: [],
        };
        this.kafkaJsClient = createKafka(cluster);
        this.kafkaClient = this.kafkaJsClient;
        this.kafkaAdminClient = this.kafkaJsClient.admin();
        this.producer = this.kafkaJsClient.producer();
    }

    canConnect(): boolean {
        return this.kafkaAdminClient !== null;
    }

    connect(): Promise<void> {
        return this.kafkaAdminClient.connect();
    }

    async getTopics(): Promise<Topic[]> {
        const listTopicsResponse = await this.kafkaAdminClient.fetchTopicMetadata();

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
        const describeClusterResponse = await this.kafkaAdminClient?.describeCluster();

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
        const describeConfigsResponse = await this.kafkaAdminClient.describeConfigs({
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
        const describeConfigsResponse = await this.kafkaAdminClient.describeConfigs({
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
        const listGroupsResponse = await this.kafkaAdminClient.listGroups();
        return Promise.resolve(listGroupsResponse.groups.map((g) => (g.groupId)));
    }

    async getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        const describeGroupResponse = await this.kafkaAdminClient.describeGroups([groupId]);

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
        await this.kafkaAdminClient.deleteGroups(groupIds);
    }

    async createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        await this.kafkaAdminClient.createTopics({
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
        return await this.kafkaAdminClient.deleteTopics({
            topics: deleteTopicRequest.topics,
            timeout: deleteTopicRequest.timeout
        });
    }

    dispose() {
        this.kafkaAdminClient.disconnect();
    }
}

export const createClient = (cluster: Cluster, workspaceSettings: WorkspaceSettings): Client => new EnsureConnectedDecorator(
    new KafkaJsClient(cluster, workspaceSettings));

export const createKafka = (connectionOptions: ConnectionOptions): Kafka => {
    let kafkaJsClient: Kafka;
    if (connectionOptions.saslOption && connectionOptions.saslOption.username && connectionOptions.saslOption.password) {
        kafkaJsClient = new Kafka({
            clientId: "vscode-kafka",
            brokers: connectionOptions.bootstrap.split(","),
            ssl: true,
            sasl: { mechanism: connectionOptions.saslOption.mechanism, username: connectionOptions.saslOption.username, password: connectionOptions.saslOption.password },
        });
    } else {
        kafkaJsClient = new Kafka({
            clientId: "vscode-kafka",
            brokers: connectionOptions.bootstrap.split(","),
            ssl: connectionOptions.ssl
        });
    }
    return kafkaJsClient;
};
