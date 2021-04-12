// ------------------ Cluster validators

import { CommonsValidator } from "../validators/commons";

const BROKER_FIELD = 'Broker';
const CLUSTER_FIELD = 'Cluster name';
const USERNAME_FIELD = 'User name';

export async function validateBroker(broker: string): Promise<string | undefined> {
    return CommonsValidator.validateFieldRequired(BROKER_FIELD, broker);
}

export async function validateClusterName(cluster: string, existingClusterNames: string[]): Promise<string | undefined> {
    const result = CommonsValidator.validateFieldRequired(CLUSTER_FIELD, cluster);
    if (result) {
        return result;
    }
    return CommonsValidator.validateFieldUniqueValue(CLUSTER_FIELD, cluster, existingClusterNames);
}

export async function validateAuthentificationUserName(userName: string): Promise<string | undefined> {
    return CommonsValidator.validateFieldRequired(USERNAME_FIELD, userName);
}

// ------------------ Topic validators

const TOPIC_FIELD = 'Topic name';
const PARTITIONS_FIELD = 'Number of partitions';
const REPLICATION_FACTOR_FIELD = 'Replication Factor';

export async function validateTopicName(topic: string, existingTopicNames: string[]): Promise<string | undefined> {
    return CommonsValidator.validateTopic(topic, existingTopicNames, TOPIC_FIELD);
}

export async function validatePartitions(partitions: string): Promise<string | undefined> {
    const result = CommonsValidator.validateFieldRequired(PARTITIONS_FIELD, partitions);
    if (result) {
        return result;
    }
    return CommonsValidator.validateFieldPositiveNumber(PARTITIONS_FIELD, partitions);
}

export async function validateReplicationFactor(replicationFactor: string, max: number): Promise<string | undefined> {
    const result = CommonsValidator.validateFieldRequired(REPLICATION_FACTOR_FIELD, replicationFactor);
    if (result) {
        return result;
    }
    return CommonsValidator.validateFieldPositiveNumber(REPLICATION_FACTOR_FIELD, replicationFactor, max);
}
