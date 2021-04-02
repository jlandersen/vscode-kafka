export interface ModelDefinition {
    name: string;
    description: string;
    enum?: ModelDefinition[];
}

export const consumerProperties = [
    {
        name: "topic",
        description: "The topic id *[required]*"
    },
    {
        name: "from",
        description: "The offset from which the consumer group will start consuming messages from. Possible values are: `earliest`, `latest`, or an integer value. *[optional]*.",
        enum: [
            {
                name: "earliest"
            },
            {
                name: "last"
            },
            {
                name: "0"
            }
        ]
    },
    {
        name: "key-format",
        description: "[Deserializer](https://github.com/jlandersen/vscode-kafka/blob/master/docs/Consuming.md#Deserializer) to use for the key *[optional]*.",
        enum: [
            {
                name: "none",
                description: "No deserializer (ignores content)"
            },
            {
                name: "string",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java) which currently only supports `UTF-8` encoding."
            },
            {
                name: "double",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleDeserializer.java)."
            },
            {
                name: "float",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatDeserializer.java)."
            },
            {
                name: "integer",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerDeserializer.java)."
            },
            {
                name: "long",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.LongDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongDeserializer.java)."
            },
            {
                name: "short",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortDeserializer.java)."
            }
        ]
    },
    {
        name: "value-format",
        description: "[Deserializer](https://github.com/jlandersen/vscode-kafka/blob/master/docs/Consuming.md#Deserializer) to use for the value *[optional]*.",
        enum: [
            {
                name: "none",
                description: "No deserializer (ignores content)"
            },
            {
                name: "string",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java) which currently only supports `UTF-8` encoding."
            },
            {
                name: "double",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleDeserializer.java)."
            },
            {
                name: "float",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatDeserializer.java)."
            },
            {
                name: "integer",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerDeserializer.java)."
            },
            {
                name: "long",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.LongDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongDeserializer.java)."
            },
            {
                name: "short",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortDeserializer.java)."
            }
        ]
    },
    {
        name: "partitions",
        description: "the partition number(s), or a partitions range, or a combinaison of partitions ranges *[optional]*. eg:\n* 0\n* 0,1,2\n* 0-2\n* 0,2-3",
        enum: [
            {
                name: "0"
            }
        ]
    }
] as ModelDefinition[];

export const producerProperties = [
    {
        name: "topic",
        description: "The topic id *[required]*"
    },
    {
        name: "key",
        description: "The key *[optional]*."
    },
    {
        name: "key-format",
        description: "[Serializer](https://github.com/jlandersen/vscode-kafka/blob/master/docs/Producing.md#Serializer) to use for the key *[optional]*.",
        enum: [
            {
                name: "string",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java) which currently only supports `UTF-8` encoding."
            },
            {
                name: "double",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleSerializer.java)."
            },
            {
                name: "float",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatSerializer.java)."
            },
            {
                name: "integer",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerSerializer.java)."
            },
            {
                name: "long",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.LongSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongSerializer.java)."
            },
            {
                name: "short",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortSerializer.java)."
            }
        ]
    },
    {
        name: "value-format",
        description: "[Serializer](https://github.com/jlandersen/vscode-kafka/blob/master/docs/Producing.md#Serializer) to use for the value *[optional]*.",
        enum: [
            {
                name: "string",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java) which currently only supports `UTF-8` encoding."
            },
            {
                name: "double",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleSerializer.java)."
            },
            {
                name: "float",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatSerializer.java)."
            },
            {
                name: "integer",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerSerializer.java)."
            },
            {
                name: "long",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.LongSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongSerializer.java)."
            },
            {
                name: "short",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortSerializer.java)."
            }
        ]
    }
] as ModelDefinition[];
