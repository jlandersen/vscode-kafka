import { ClientState } from "../../../../client";
import { getLanguageService } from "../../../../kafka-file/languageservice/kafkaFileLanguageService";
import { assertHover, hover, LanguageServiceConfig, position } from "./kafkaAssert";

suite("Kafka File Hover Test Suite", () => {

    test("Empty hover", async () => {
        await assertHover('');

        await assertHover('ab|cd');

    });

});

suite("Kafka File CONSUMER Hover Test Suite", () => {

    test("CONSUMER declaration no topic Hover", async () => {

        await assertHover(
            'CONS|UMER\n',
            hover(
                `Consumer declaration.\n\nSee [here](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Consuming%22%2C%22section%22%3A%22kafka-file%22%7D%5D) for more informations.`,
                position(0, 0),
                position(1, 0)
            )
        );

    });

    test("CONSUMER declaration with topic Hover", async () => {

        await assertHover(
            'CONS|UMER\n' +
            'topic: abcd',
            hover(
                `Consumer declaration for topic \`abcd\`.\n\n\See [here](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Consuming%22%2C%22section%22%3A%22kafka-file%22%7D%5D) for more informations.`,
                position(0, 0),
                position(1, 11)
            )
        );

    });

    test("topic property name Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'top|ic: abcd',
            hover(
                `The topic id *[required]*`,
                position(1, 0),
                position(1, 5)
            )
        );

    });

    test("topic property value Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'topic: ab|cd'
        );

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setTopics('cluster1', [{ id: 'abcd', partitionCount: 1, replicationFactor: 1 }]);
        const connectedCuster = { clusterId: 'cluster1', clusterName: 'CLUSTER_1', clusterState: ClientState.connected };
        languageServiceConfig.setSelectedCluster(connectedCuster);
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertHover(
            'CONSUMER\n' +
            'topic: ab|cd',
            hover(
                'Topic `abcd`\n * partition count: `1`\n * replication factor: `1`\n',
                position(1, 6),
                position(1, 11)
            ),
            languageService
        );

    });

    test("from property name Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'fro|m: earliest',
            hover(
                'The offset from which the consumer group will start consuming messages from. Possible values are: `earliest`, `latest`, or an integer value. *[optional]*.',
                position(1, 0),
                position(1, 4)
            )
        );

    });

    test("key-format property name Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'key-for|mat: string',
            hover(
                '[Deserializer](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Consuming%22%2C%22section%22%3A%22deserializer%22%7D%5D) to use for the key *[optional]*.',
                position(1, 0),
                position(1, 10)
            )
        );

    });

    test("key-format property value Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'key-format: stri|ng',
            hover(
                'Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java).',
                position(1, 12),
                position(1, 18)
            )
        );

    });

    test("value-format property name Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'value-for|mat: string',
            hover(
                '[Deserializer](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Consuming%22%2C%22section%22%3A%22deserializer%22%7D%5D) to use for the value *[optional]*.',
                position(1, 0),
                position(1, 12)
            )
        );

    });

    test("value-format property value Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'value-format: stri|ng',
            hover(
                'Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java).',
                position(1, 14),
                position(1, 20)
            )
        );

    });

    test("partitions property name Hover", async () => {

        await assertHover(
            'CONSUMER\n' +
            'partition|s: 0',
            hover(
                'the partition number(s), or a partitions range, or a combinaison of partitions ranges *[optional]*. eg:\n* 0\n* 0,1,2\n* 0-2\n* 0,2-3',
                position(1, 0),
                position(1, 10)
            )
        );

    });

});

suite("Kafka File PRODUCER Hover Test Suite", () => {

    test("PRODUCER declaration no topic Hover", async () => {

        await assertHover(
            'PRODU|CER\n',
            hover(
                `Producer declaration.\n\nSee [here](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Producing%22%2C%22section%22%3A%22kafka-file%22%7D%5D) for more informations.`,
                position(0, 0),
                position(1, 0)
            )
        );

    });

    test("PRODUCER declaration with topic Hover", async () => {

        await assertHover(
            'PRODU|CER\n' +
            'topic: abcd',
            hover(
                `Producer declaration for topic \`abcd\`.\n\n\See [here](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Producing%22%2C%22section%22%3A%22kafka-file%22%7D%5D) for more informations.`,
                position(0, 0),
                position(1, 11)
            )
        );
    });

    test("topic property name Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'top|ic: abcd',
            hover(
                `The topic id *[required]*`,
                position(1, 0),
                position(1, 5)
            )
        );

    });

    test("topic property value Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'topic: ab|cd'
        );

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setTopics('cluster1', [{ id: 'abcd', partitionCount: 1, replicationFactor: 1 }]);
        const connectedCuster = { clusterId: 'cluster1', clusterName: 'CLUSTER_1', clusterState: ClientState.connected };
        languageServiceConfig.setSelectedCluster(connectedCuster);
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertHover(
            'PRODUCER\n' +
            'topic: ab|cd',
            hover(
                'Topic `abcd`\n * partition count: `1`\n * replication factor: `1`\n',
                position(1, 6),
                position(1, 11)
            ),
            languageService
        );

    });

    test("key property name Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'ke|y: abcd',
            hover(
                'The key *[optional]*.',
                position(1, 0),
                position(1, 3)
            )
        );

    });

    test("key-format property name Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'key-for|mat: string',
            hover(
                '[Serializer](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Producing%22%2C%22section%22%3A%22serializer%22%7D%5D) to use for the key *[optional]*.',
                position(1, 0),
                position(1, 10)
            )
        );

    });

    test("key-format property value Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'key-format: stri|ng',
            hover(
                'Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java).',
                position(1, 12),
                position(1, 18)
            )
        );

    });

    test("value-format property name Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'value-for|mat: string',
            hover(
                '[Serializer](command:vscode-kafka.open.docs.page?%5B%7B%22page%22%3A%22Producing%22%2C%22section%22%3A%22serializer%22%7D%5D) to use for the value *[optional]*.',
                position(1, 0),
                position(1, 12)
            )
        );

    });

    test("value-format property value Hover", async () => {

        await assertHover(
            'PRODUCER\n' +
            'value-format: stri|ng',
            hover(
                'Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java).',
                position(1, 14),
                position(1, 20)
            )
        );

    });

});