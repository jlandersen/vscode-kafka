import { CompletionItemKind } from "vscode";
import { getLanguageService } from "../../../../kafka-file/languageservice/kafkaFileLanguageService";
import { LanguageServiceConfig, position, range, testCompletion } from "./kafkaAssert";

const languageServiceConfig = new LanguageServiceConfig();
languageServiceConfig.setSelectedCluster({ clusterId: 'cluster1', clusterName: 'CLUSTER_1' });
languageServiceConfig.setTopics('cluster1', [{id : 'abcd', partitionCount : 1 , replicationFactor : 1}]);
const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

suite("Kafka File Completion with Topics Test Suite", () => {

    test("Empty completion", async () => {
        await testCompletion('', {
            items: []
        }, false, languageService);

        await testCompletion('ab|cd', {
            items: []
        }, false, languageService);

    });

});

suite("Kafka File PRODUCER Topic Completion Test Suite", () => {

    test("PRODUCER Topic Completion", async () => {


        await testCompletion(
            'PRODUCER a\n' +
            'topic: |'
            , {
                items: [
                    {
                        label: 'abcd', kind: CompletionItemKind.Value,
                        insertText: ' abcd',
                        range: range(position(1, 6), position(1, 7))
                    }
                ]
            }, false, languageService);
    });

});

suite("Kafka File CONSUMER Topic Completion Test Suite", () => {

    test("CONSUMER Topic Completion", async () => {

        await testCompletion(
            'CONSUMER a\n' +
            'topic: |'
            , {
                items: [
                    {
                        label: 'abcd', kind: CompletionItemKind.Value,
                        insertText: ' abcd',
                        range: range(position(1, 6), position(1, 7))
                    }
                ]
            }, false, languageService);
    });

});
