import { DiagnosticSeverity } from "vscode";
import { ClientState } from "../../../../client";
import { getLanguageService } from "../../../../kafka-file/languageservice/kafkaFileLanguageService";
import { assertDiagnostics, diagnostic, LanguageServiceConfig, position } from "./kafkaAssert";

const connectedCuster = { clusterId: 'cluster1', clusterName: 'CLUSTER_1', clusterState: ClientState.connected };
const disconnectedCuster = { clusterId: 'cluster1', clusterName: 'CLUSTER_1', clusterState: ClientState.disconnected };
const invalidCuster = { clusterId: 'cluster1', clusterName: 'CLUSTER_1', clusterState: ClientState.invalid };

const languageServiceConfig = new LanguageServiceConfig();
languageServiceConfig.setTopics('cluster1', [{ id: 'abcd', partitionCount: 1, replicationFactor: 1 }]);
const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

suite("Kafka File CONSUMER Topic Diagnostics Test Suite", () => {

    test("Existing topic", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd',
            [],
            languageService
        );

    });

    test("Unknown topic with enabled auto create topic config", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "enabled" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 10),
                    "Unknown topic 'efgh'. Topic will be created automatically.",
                    DiagnosticSeverity.Information
                )
            ],
            languageService
        );
    });

    test("Unknown topic with disabled auto create topic config", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "disabled" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 10),
                    "Unknown topic 'efgh'. Cluster does not support automatic topic creation.",
                    DiagnosticSeverity.Error
                )
            ],
            languageService
        );

    });

    test("Unknown topic with unknown auto create topic config", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "unknown" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 10),
                    "Unknown topic 'efgh'. Cluster might not support automatic topic creation.",
                    DiagnosticSeverity.Warning
                )
            ],
            languageService
        );

    });

});

suite("Kafka File PRODUCER Topic Diagnostics Test Suite", () => {

    test("Existing topic", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);

        await assertDiagnostics(
            'PRODUCER\n' +            
            'topic:abcd\n' + 
            'some value',
            [],
            languageService
        );

    });

    test("Unknown topic with enabled auto create topic config", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "enabled" });

        await assertDiagnostics(
            'PRODUCER\n' +            
            'topic:efgh\n' + 
            'some value',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 10),
                    "Unknown topic 'efgh'. Topic will be created automatically.",
                    DiagnosticSeverity.Information
                )
            ],
            languageService
        );
    });
});

suite("Kafka File Topic Diagnostics and Cluster state Test Suite", () => {

    test("Unknown topic with enabled auto create topic config", async () => {

        // Test with connected cluster
        languageServiceConfig.setSelectedCluster(connectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "enabled" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 10),
                    "Unknown topic 'efgh'. Topic will be created automatically.",
                    DiagnosticSeverity.Information
                )
            ],
            languageService
        );

        // Test with disconnected cluster
        languageServiceConfig.setSelectedCluster(disconnectedCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "enabled" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [],
            languageService
        );

        // Test with invalid cluster
        languageServiceConfig.setSelectedCluster(invalidCuster);
        languageServiceConfig.setAutoCreateConfig({ type: "enabled" });

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:efgh',
            [],
            languageService
        );


    });
});