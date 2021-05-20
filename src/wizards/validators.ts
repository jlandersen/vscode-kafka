// ------------------ Cluster validators
import * as fs from "fs";
import { CommonsValidator } from "../validators/commons";

const BROKER_FIELD = 'Broker';
const CLUSTER_FIELD = 'Cluster name';
const USERNAME_FIELD = 'User name';

export function validateBroker(broker: string): string | undefined {
    return CommonsValidator.validateFieldRequired(BROKER_FIELD, broker);
}

export function validateClusterName(cluster: string, existingClusterNames: string[]): string | undefined {
    const result = CommonsValidator.validateFieldRequired(CLUSTER_FIELD, cluster);
    if (result) {
        return result;
    }
    return CommonsValidator.validateFieldUniqueValue(CLUSTER_FIELD, cluster, existingClusterNames);
}

export function validateAuthentificationUserName(userName: string): string | undefined {
    return CommonsValidator.validateFieldRequired(USERNAME_FIELD, userName);
}

export function validateFile(filePath: string) : string | undefined {
    if (!fs.existsSync(filePath)) {
        return `The file '${filePath}' doesn't exist.`;
    }
    if (fs.lstatSync(filePath).isDirectory()) {
        return `'${filePath}' is a directory, please select a file.`;
    }
    return undefined;
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
