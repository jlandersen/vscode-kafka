/**
 * Abstract types for the Kafka client API.
 * These types are implementation-agnostic and do not expose any kafkajs dependencies.
 */

/**
 * Represents an offset position within a partition.
 * Replaces kafkajs SeekEntry.
 */
export interface PartitionOffset {
    partition: number;
    offset: string;
}

/**
 * Represents partition offsets with high/low watermarks.
 * Replaces kafkajs SeekEntry & { high: string; low: string }.
 */
export interface TopicPartitionOffsets extends PartitionOffset {
    high: string;
    low: string;
}

/**
 * Message headers type.
 * Replaces kafkajs IHeaders.
 */
export interface MessageHeaders {
    [key: string]: Buffer | string | (Buffer | string)[] | undefined;
}

/**
 * A message to be produced.
 */
export interface ProducerMessage {
    key?: Buffer | string | null;
    value: Buffer | string | null;
    partition?: number;
    headers?: MessageHeaders;
    timestamp?: string;
}

/**
 * A record to be produced to a topic.
 * Replaces kafkajs ProducerRecord.
 */
export interface ProducerRecord {
    topic: string;
    messages: ProducerMessage[];
    acks?: number;
    timeout?: number;
    compression?: number;
}

/**
 * Metadata returned after producing a record.
 * Replaces kafkajs RecordMetadata.
 */
export interface RecordMetadata {
    topicName: string;
    partition: number;
    errorCode: number;
    baseOffset?: string;
    logAppendTime?: string;
    logStartOffset?: string;
}

/**
 * Consumer configuration options.
 * Replaces kafkajs ConsumerConfig.
 */
export interface ConsumerConfig {
    groupId: string;
    partitionAssigners?: any[];
    sessionTimeout?: number;
    rebalanceTimeout?: number;
    heartbeatInterval?: number;
    maxBytesPerPartition?: number;
    minBytes?: number;
    maxBytes?: number;
    maxWaitTimeInMs?: number;
    retry?: {
        retries?: number;
    };
}

/**
 * Abstract Kafka producer interface.
 */
export interface KafkaProducer {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(record: ProducerRecord): Promise<RecordMetadata[]>;
}

/**
 * Abstract Kafka consumer interface.
 */
export interface KafkaConsumer {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(options: { topic: string; fromBeginning?: boolean }): Promise<void>;
    run(options: { eachMessage: (payload: ConsumedMessagePayload) => Promise<void> }): Promise<void>;
    seek(options: { topic: string; partition: number; offset: string }): void;
}

/**
 * Payload received when consuming a message.
 */
export interface ConsumedMessagePayload {
    topic: string;
    partition: number;
    message: {
        key: Buffer | null;
        value: Buffer | null;
        timestamp: string;
        offset: string;
        headers?: MessageHeaders;
    };
}

/**
 * Kafka client configuration.
 * Replaces kafkajs KafkaConfig for the extension API.
 */
export interface KafkaClientConfig {
    clientId?: string;
    brokers: string[];
    ssl?: boolean | {
        ca?: Buffer | string;
        key?: Buffer | string;
        cert?: Buffer | string;
        passphrase?: string;
        rejectUnauthorized?: boolean;
    };
    sasl?: {
        mechanism: string;
        [key: string]: any;
    };
    connectionTimeout?: number;
    requestTimeout?: number;
}
