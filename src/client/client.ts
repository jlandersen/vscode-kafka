// eslint-disable-next-line @typescript-eslint/no-var-requires
const kafka = require("kafka-node");

import { Admin, Kafka } from "kafkajs";
import { Disposable } from "vscode";
import { WorkspaceSettings } from "../settings";

export interface Cluster {
    id: string;
    name: string;
    bootstrap: string;
    saslOption?: SaslOption;
}

/**
 * The supported SASL mechanisms for authentication.
 */
export type SaslMechanism = "plain";

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
    isConnected: boolean;
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

export interface Options {
    host: string;
    sasl: "none" | "SASL/PLAIN";
}

export interface ConsumerGroup {
    groupId: string;
    state: "Dead" | "Stable" | "CompletingRebalance" | "PreparingRebalance" | "Empty";
    error: any;
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
    kafkaClient: any;
    kafkaCyclicProducerClient: any;
    kafkaKeyedProducerClient: any;
    canConnect(): boolean;
    connect(): Promise<void>;
    getTopics(): Promise<Topic[]>;
    getBrokers(): Promise<Broker[]>;
    getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]>;
    getTopicConfigs(topicId: string): Promise<ConfigEntry[]>;
    getConsumerGroupIds(): Promise<string[]>;
    getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup>;
    createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]>;
    refreshMetadata(): Promise<void>;
}

class EnsureConnectedDecorator implements Client {
    constructor(private client: Client) {
    }

    get kafkaClient(): any {
        return this.client.kafkaClient;
    }

    get kafkaCyclicProducerClient(): any {
        return this.client.kafkaCyclicProducerClient;
    }

    get kafkaKeyedProducerClient(): any {
        return this.client.kafkaKeyedProducerClient;
    }

    public canConnect(): boolean {
        return this.client.canConnect();
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

    public async createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        await this.waitUntilConnected();
        return await this.client.createTopic(createTopicRequest);
    }

    public async refreshMetadata(): Promise<void> {
        await this.waitUntilConnected();
        await this.client.refreshMetadata();
    }

    public dispose(): void {
        return this.client.dispose();
    }

    private async waitUntilConnected(): Promise<void> {
        if (!this.client.canConnect()) {
            throw new Error("Unable to connect");
        }

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
    kafkaClient: Kafka;
    kafkaCyclicProducerClient: any;
    kafkaKeyedProducerClient: any;

    private kafkaAdminClient: Admin;
    private host: string;
    private sasl?: SaslOption;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    constructor(cluster: Cluster, workspaceSettings: WorkspaceSettings) {
        this.metadata = {
            brokers: [],
            topics: [],
        };

        this.host = cluster.bootstrap;
        this.sasl = cluster.saslOption;

        this.kafkaClient = new Kafka({
            clientId: 'vscode-kafka',
            brokers: cluster.bootstrap.split(","),
        });

        this.kafkaAdminClient = this.kafkaClient.admin();
    }
    
    canConnect(): boolean {
        return this.host !== "";
    }
    
    async connect(): Promise<void> {
        await this.kafkaAdminClient.connect();
    }
    
    async getTopics(): Promise<Topic[]> {
        const meta = await this.kafkaAdminClient.fetchTopicMetadata();
        this.metadata.topics = meta.topics.map((t) => {
            return { id: t.name, partitionCount: 0, replicationFactor: 0, partitions: {} };
        });

        return [];
    }
    
    getBrokers(): Promise<Broker[]> {
        throw new Error("Method not implemented.");
    }
    
    getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        throw new Error("Method not implemented.");
    }
    
    getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        throw new Error("Method not implemented.");
    }
    
    getConsumerGroupIds(): Promise<string[]> {
        throw new Error("Method not implemented.");
    }
    
    getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        throw new Error("Method not implemented.");
    }
    
    createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        throw new Error("Method not implemented.");
    }
    
    refreshMetadata(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    
    dispose(): any {
        throw new Error("Method not implemented.");
    }

}

class KafkaNodeClient implements Client {
    public kafkaClient: any;
    public kafkaCyclicProducerClient: any;
    public kafkaKeyedProducerClient: any;
    private kafkaAdminClient: any;
    private host: string;
    private sasl?: SaslOption;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    constructor(cluster: Cluster, workspaceSettings: WorkspaceSettings) {
        this.metadata = {
            brokers: [],
            topics: [],
        };

        this.host = cluster.bootstrap;
        this.sasl = cluster.saslOption;
    }

    canConnect(): boolean {
        return this.host !== "";
    }

    connect(): Promise<void> {
        if (this.kafkaClient && this.kafkaClient.ready) {
            return this.refreshMetadata();
        }

        this.kafkaClient = new kafka.KafkaClient({
            autoConnect: false,
            connectRetryOptions: {
                retries: 1,
            },
            sasl: this.sasl,
            connectTimeout: 3000,
            kafkaHost: this.host,
            sslOptions: this.sasl ? {} : undefined
        });

        this.kafkaAdminClient = new kafka.Admin(this.kafkaClient);
        this.kafkaAdminClient.on("error", (error: any) => {
            // Ignore this, connection error is handled using kafkaClient error event
            console.error(error);
        });

        return new Promise((resolve, reject) => {
            this.kafkaClient.connect();
            this.kafkaClient.on("ready", () => {
                this.kafkaCyclicProducerClient = new kafka.HighLevelProducer(this.kafkaClient, {
                    partitionerType: 2,
                });
                this.kafkaKeyedProducerClient = new kafka.HighLevelProducer(this.kafkaClient, {
                    partitionerType: 3,
                });

                this.kafkaClient.loadMetadataForTopics([], (error: any, result: any) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    this.metadata = this.parseMetadataResponse(result);
                    resolve();
                });
            });

            this.kafkaClient.on("error", (error: any) => {
                reject(error);
            });
        });
    }

    getTopics(): Promise<Topic[]> {
        return Promise.resolve(this.metadata.topics);
    }

    getBrokers(): Promise<Broker[]> {
        return Promise.resolve(this.metadata.brokers);
    }

    getBrokerConfigs(brokerId: string): Promise<ConfigEntry[]> {
        return this.getResourceConfigs(this.kafkaAdminClient.RESOURCE_TYPES.broker, brokerId);
    }

    getTopicConfigs(topicId: string): Promise<ConfigEntry[]> {
        return this.getResourceConfigs(this.kafkaAdminClient.RESOURCE_TYPES.topic, topicId);
    }

    getConsumerGroupIds(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.kafkaAdminClient.listGroups((error: any, result: any) => {
                if (error) {
                    return reject(error);
                }

                resolve(Object.keys(result));
            });
        });
    }

    getConsumerGroupDetails(groupId: string): Promise<ConsumerGroup> {
        return new Promise((resolve, reject) => {
            this.kafkaAdminClient.describeGroups([groupId], (error: any, result: any) => {
                if (error) {
                    return reject(error);
                }

                resolve(result[groupId]);
            });
        });
    }

    createTopic(createTopicRequest: CreateTopicRequest): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.kafkaClient.createTopics([createTopicRequest], (error: any, result: any) => {
                if (error) {
                    return reject(error);
                }

                resolve(result);
            });
        });
    }

    refreshMetadata(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.kafkaClient.loadMetadataForTopics([], (error: any, result: any) => {
                if (error) {
                    reject(error);
                    return;
                }

                this.metadata = this.parseMetadataResponse(result);
                resolve();
            });
        });
    }

    dispose(): void {
        if (this.kafkaClient) {
            this.kafkaClient.close();
        }

        this.kafkaClient = null;
        this.kafkaAdminClient = null;
        this.kafkaCyclicProducerClient = null;
        this.kafkaKeyedProducerClient = null;
    }

    private parseMetadataResponse(response: any[]): { topics: Topic[]; brokers: Broker[] } {
        return {
            brokers: this.parseBrokers(response[0], response[1].clusterMetadata),
            topics: this.parseTopics(response[1].metadata),
        };
    }

    private parseTopics(topicMetadata: any): Topic[] {
        return Object.keys(topicMetadata).map((topicId) => {
            const partitions = Object.keys(topicMetadata[topicId]);
            let replicationFactor = 0;

            if (partitions.length > 0) {
                replicationFactor = topicMetadata[topicId][partitions[0]].replicas.length;
            }

            return {
                id: topicId,
                partitionCount: partitions.length,
                replicationFactor,
                partitions: topicMetadata[topicId],
            };
        });
    }

    private parseBrokers(brokerMetadata: any, clusterMetadata: any): Broker[] {
        const brokerIds = Object.keys(brokerMetadata);

        const brokers: Broker[] = brokerIds.map((brokerId) => {
            const brokerData = brokerMetadata[brokerId];

            const brokerWrapper = this.kafkaClient.getBrokers()[brokerData.host + ":" + brokerData.port];
            let isConnected = false;

            if (brokerWrapper) {
                isConnected = brokerWrapper.isReady();
            }

            return {
                id: brokerId,
                host: brokerData.host,
                port: brokerData.port,
                isController: brokerId === clusterMetadata.controllerId.toString(),
                isConnected,
            };
        });

        return brokers;
    }

    private getResourceConfigs(resourceType: string, resourceName: string): Promise<ConfigEntry[]> {
        const resource = {
            resourceType,
            resourceName,
            configNames: [],
        };

        const payload = {
            resources: [resource],
            includeSynonyms: false,
        };

        return new Promise((resolve, reject) => {
            this.kafkaAdminClient.describeConfigs(payload,
                (err: any, res: Array<{ configEntries: ConfigEntry[] }>) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (res.length === 0) {
                        return [];
                    }

                    resolve(res[0].configEntries);
                });
        });
    }
}

export const createClient = (cluster: Cluster, workspaceSettings: WorkspaceSettings): Client => new EnsureConnectedDecorator(
    new KafkaNodeClient(cluster, workspaceSettings));
