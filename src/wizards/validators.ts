// ------------------ Cluster validators

const BROKER_FIELD = 'Broker';
const CLUSTER_FIELD = 'Cluster name';
const USERNAME_FIELD = 'User name';

export async function validateBroker(broker: string): Promise<string | undefined> {
    return validateFieldRequired(BROKER_FIELD, broker);
}

export async function validateClusterName(cluster: string, existingClusterNames: string[]): Promise<string | undefined> {
    const result = validateFieldRequired(CLUSTER_FIELD, cluster);
    if (result) {
        return result;
    }
    return validateFieldUniqueValue(CLUSTER_FIELD, cluster, existingClusterNames);
}

export async function validateAuthentificationUserName(userName: string): Promise<string | undefined> {
    return validateFieldRequired(USERNAME_FIELD, userName);
}

// ------------------ Topic validators

const TOPIC_FIELD = 'Topic name';
const PARTITIONS_FIELD = 'Number of partitions';
const REPLICATION_FACTOR_FIELD = 'Replication Factor';

const maxNameLength = 249;
const legalChars = /^[a-zA-Z0-9\\._\\-]*$/;

export async function validateTopicName(topic: string, existingTopicNames: string[]): Promise<string | undefined> {
    // See topic name validation rule at https://github.com/apache/kafka/blob/8007211cc982d8458223e866c1ee7d94b69e0249/core/src/main/scala/kafka/common/Topic.scala#L33
    const result = validateFieldRequired(TOPIC_FIELD, topic);
    if (result) {
        return result;
    }
    else if (topic === "." || topic === "..") {
        return `${TOPIC_FIELD} cannot be '.' or '..'`;
    }
    else if (topic.length > maxNameLength) {
        return `${TOPIC_FIELD} is illegal, cannot be longer than ${maxNameLength} characters`;
    }
    else if (!legalChars.test(topic)) {
        return `${TOPIC_FIELD} '${topic}' is illegal, contains a character other than ASCII alphanumerics, '.', '_' and '-'`;
    }
    return validateFieldUniqueValue(TOPIC_FIELD, topic, existingTopicNames);
}

export async function validatePartitions(partitions: string): Promise<string | undefined> {
    const result = validateFieldRequired(PARTITIONS_FIELD, partitions);
    if (result) {
        return result;
    }
    return validateFieldPositiveNumber(PARTITIONS_FIELD, partitions);
}

export async function validateReplicationFactor(replicationFactor: string, max: number): Promise<string | undefined> {
    const result = validateFieldRequired(REPLICATION_FACTOR_FIELD, replicationFactor);
    if (result) {
        return result;
    } 
    return validateFieldPositiveNumber(REPLICATION_FACTOR_FIELD, replicationFactor, max);
}

// ------------------ Commons Validators

function validateFieldRequired(name: string, value: string): string | undefined {
    if (value.length <= 0) {
        return `${name} is required.`;
    }
    if (value.trim().length === 0) {
        return `${name} cannot be blank.`;
    }
}

function validateFieldUniqueValue(name: string, value: string, values: string[]): string | undefined {
    if (values.indexOf(value) !== -1) {
        return `${name} '${value}' already exists.`;
    }
}

function validateFieldPositiveNumber(name: string, value: string, max?: number): string | undefined {
    const valueAsNumber = Number(value);
    if (isNaN(valueAsNumber) || valueAsNumber < 1) {
        return `${name} must be a positive number.`;
    }
    if (max && valueAsNumber > max) {
        return `${name} can not be greater than ${max}.`;
    }
}
