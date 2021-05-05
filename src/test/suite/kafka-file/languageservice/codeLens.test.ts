import { ConsumerLaunchState } from "../../../../client";
import { LaunchConsumerCommand, ProduceRecordCommand } from "../../../../commands";
import { getLanguageService } from "../../../../kafka-file/languageservice/kafkaFileLanguageService";
import { assertCodeLens, codeLens, LanguageServiceConfig, position } from "./kafkaAssert";

suite("Kafka File CodeLens Test Suite", () => {

    test("Empty blocks", async () => {
        const languageServiceConfig = new LanguageServiceConfig();
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens('', [], languageService);
        await assertCodeLens('   ', [], languageService);
        await assertCodeLens('a\nb', [], languageService);
        await assertCodeLens('abcd', [], languageService);
    });

});

suite("Kafka File PRODUCER CodeLens Test Suite", () => {

    test("PRODUCER without cluster selection", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens('PRODUCER', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'Select a cluster'
            })
        ], languageService);

        await assertCodeLens(
            'PRODUCER\n' +
            '###\n' +
            'PRODUCER',
            [
                codeLens(position(0, 0), position(0, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                }),
                codeLens(position(2, 0), position(2, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                })
            ], languageService);

        await assertCodeLens(
            'PRODUCER\n' +
            '###    XXXXXXXXXXXXXXXXXXXXXXXX\n' +
            'PRODUCER',
            [
                codeLens(position(0, 0), position(0, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                }),
                codeLens(position(2, 0), position(2, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                })
            ], languageService);
    });

    test("PRODUCER with cluster selection", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setSelectedCluster({ clusterId: 'cluster1', clusterName: 'CLUSTER_1' });
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens('PRODUCER', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run) Produce record',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: undefined,
                        messageKeyFormat: undefined,
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: undefined,
                        messageValueFormatSettings: undefined,
                        topicId: undefined,
                        value: undefined
                    }  as ProduceRecordCommand,
                    1
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run-all) Produce record x 10',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: undefined,
                        messageKeyFormat: undefined,
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: undefined,
                        messageValueFormatSettings: undefined,
                        topicId: undefined,
                        value: undefined
                    } as ProduceRecordCommand,
                    10
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

        await assertCodeLens(
            'PRODUCER\n' +
            'key: a-key\n' +
            'topic: abcd\n' +
            'key-format: long\n' +
            'value-format: string\n' +
            'ABCD\n' +
            'EFGH', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run) Produce record',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: 'a-key',
                        messageKeyFormat: 'long',
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: 'string',
                        messageValueFormatSettings: undefined,
                        topicId: 'abcd',
                        value: 'ABCD\nEFGH'
                    } as ProduceRecordCommand,
                    1
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run-all) Produce record x 10',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: 'a-key',
                        messageKeyFormat: 'long',
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: 'string',
                        messageValueFormatSettings: undefined,
                        topicId: 'abcd',
                        value: 'ABCD\nEFGH'
                    } as ProduceRecordCommand,
                    10
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

    });

    test("PRODUCER with string encoding", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setSelectedCluster({ clusterId: 'cluster1', clusterName: 'CLUSTER_1' });
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens(
            'PRODUCER\n' +
            'key: a-key\n' +
            'topic: abcd\n' +
            'key-format: string(base64)\n' +
            'value-format: string(ascii)\n' +
            'ABCD\n' +
            'EFGH', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run) Produce record',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: 'a-key',
                        messageKeyFormat: 'string',
                        messageKeyFormatSettings: [{ value: 'base64' }],
                        messageValueFormat: 'string',
                        messageValueFormatSettings: [{ value: 'ascii' }],
                        topicId: 'abcd',
                        value: 'ABCD\nEFGH'
                    } as ProduceRecordCommand,
                    1
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.producer.produce',
                title: '$(run-all) Produce record x 10',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        key: 'a-key',
                        messageKeyFormat: 'string',
                        messageKeyFormatSettings: [{ value: 'base64' }],
                        messageValueFormat: 'string',
                        messageValueFormatSettings: [{ value: 'ascii' }],
                        topicId: 'abcd',
                        value: 'ABCD\nEFGH'
                    } as ProduceRecordCommand,
                    10
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

    });

});

suite("Kafka File CONSUMER CodeLens Test Suite", () => {


    test("CONSUMER without cluster selection", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens('CONSUMER group-1', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'Select a cluster'
            })
        ], languageService);

        await assertCodeLens(
            'CONSUMER group-1\n' +
            'CONSUMER group-2',
            [
                codeLens(position(0, 0), position(0, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                }),
                codeLens(position(1, 0), position(1, 0), {
                    command: 'vscode-kafka.explorer.selectcluster',
                    title: 'Select a cluster'
                })
            ], languageService);
    });

    test("CONSUMER with cluster selection", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setSelectedCluster({ clusterId: 'cluster1', clusterName: 'CLUSTER_1' });
        languageServiceConfig.setConsumerLaunchState('cluster1', 'group-1', ConsumerLaunchState.started);
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens('CONSUMER group-1', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.consumer.stop',
                title: '$(debug-stop) Stop consumer',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        consumerGroupId: 'group-1',
                        fromOffset: undefined,
                        messageKeyFormat: undefined,
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: undefined,
                        messageValueFormatSettings: undefined,
                        partitions: undefined,
                        topicId: ''
                    }  as LaunchConsumerCommand
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

        await assertCodeLens(
            'CONSUMER group-1\n' +
            'topic: abcd\n' +
            'from: 10\n' +
            'partitions: 1,2,3\n' +
            'key-format: long\n' +
            'value-format: string\n', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.consumer.stop',
                title: '$(debug-stop) Stop consumer',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        consumerGroupId: 'group-1',
                        fromOffset: '10',
                        messageKeyFormat: 'long',
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: 'string',
                        messageValueFormatSettings: undefined,
                        partitions: '1,2,3',
                        topicId: 'abcd'
                    } as LaunchConsumerCommand
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

        await assertCodeLens(
            'CONSUMER group-1\n' +
            'CONSUMER group-2', [

            // group-1
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.consumer.stop',
                title: '$(debug-stop) Stop consumer',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        consumerGroupId: 'group-1',
                        fromOffset: undefined,
                        messageKeyFormat: undefined,
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: undefined,
                        messageValueFormatSettings: undefined,
                        partitions: undefined,
                        topicId: ''
                    } as LaunchConsumerCommand
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            }),

            // group-2
            codeLens(position(1, 0), position(1, 0), {
                command: 'vscode-kafka.consumer.start',
                title: '$(debug-start) Start consumer',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        consumerGroupId: 'group-2',
                        fromOffset: undefined,
                        messageKeyFormat: undefined,
                        messageKeyFormatSettings: undefined,
                        messageValueFormat: undefined,
                        messageValueFormatSettings: undefined,
                        partitions: undefined,
                        topicId: ''
                    } as LaunchConsumerCommand
                ]
            }),
            codeLens(position(1, 0), position(1, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);
    });

    test("CONSUMER with string encoding", async () => {

        const languageServiceConfig = new LanguageServiceConfig();
        languageServiceConfig.setSelectedCluster({ clusterId: 'cluster1', clusterName: 'CLUSTER_1' });
        languageServiceConfig.setConsumerLaunchState('cluster1', 'group-1', ConsumerLaunchState.started);
        const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

        await assertCodeLens(
            'CONSUMER group-1\n' +
            'topic: abcd\n' +
            'from: 10\n' +
            'partitions: 1,2,3\n' +
            'key-format: string(base64)\n' +
            'value-format: string(ascii)\n', [
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.consumer.stop',
                title: '$(debug-stop) Stop consumer',
                arguments: [
                    {
                        clusterId: 'cluster1',
                        consumerGroupId: 'group-1',
                        fromOffset: '10',
                        messageKeyFormat: 'string',
                        messageKeyFormatSettings: [{ value: 'base64' }],
                        messageValueFormat: 'string',
                        messageValueFormatSettings: [{ value: 'ascii' }],
                        partitions: '1,2,3',
                        topicId: 'abcd'
                    } as LaunchConsumerCommand
                ]
            }),
            codeLens(position(0, 0), position(0, 0), {
                command: 'vscode-kafka.explorer.selectcluster',
                title: 'CLUSTER_1'
            })
        ], languageService);

    });

});
