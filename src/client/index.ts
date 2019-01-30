// tslint:disable-next-line:no-var-requires
const kafka = require("kafka-node");

import { Disposable } from "vscode";

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

export class Client implements Disposable {
    public kafkaClient: any;
    public kafkaCyclicProducerClient: any;
    public kafkaKeyedProducerClient: any;
    private kafkaAdminClient: any;
    private host: string;

    private metadata: {
        topics: Topic[];
        brokers: Broker[];
    };

    constructor(options: Options) {
        this.metadata = {
            brokers: [],
            topics: [],
        };

        this.host = options.host;
    }

    canConnect() {
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
            connectTimeout: 3000,
            kafkaHost: this.host,
        });

        this.kafkaAdminClient = new kafka.Admin(this.kafkaClient);
        this.kafkaAdminClient.on("error", (error: any) => {
            // Ignore this, connection error is handled using kafkaClient error event
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

    getTopics(): Topic[] {
        return this.metadata.topics;
    }

    getBrokers(): Broker[] {
        return this.metadata.brokers;
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

    refresh(options: Options) {
        this.dispose();

        this.host = options.host;
        this.kafkaClient = null;
    }

    dispose() {
        if (this.kafkaClient) {
            this.kafkaClient.close();
        }

        this.kafkaClient = null;
        this.kafkaAdminClient = null;
        this.kafkaCyclicProducerClient = null;
        this.kafkaKeyedProducerClient = null;
    }

    private parseMetadataResponse(response: any[]): { topics: Topic[], brokers: Broker[] } {
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
