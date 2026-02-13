import * as assert from "assert";
import * as vscode from "vscode";
import { BrokerConfigs } from "../../../client/config";
import * as common from "../../../commands/common";
import { DeleteTopicCommandHandler } from "../../../commands/topics";

suite("Delete Topic Command Handler Test Suite", () => {

    test("deletes selected topics across clusters", async () => {
        const warningMessages: string[] = [];
        const infoMessages: string[] = [];
        const deleteCalls: { clusterId: string; topics: string[]; }[] = [];

        const clientA = {
            cluster: { id: "cluster-a", name: "Cluster A" },
            deleteTopic: async (request: { topics: string[]; }) => {
                deleteCalls.push({ clusterId: "cluster-a", topics: request.topics });
            }
        };
        const clientB = {
            cluster: { id: "cluster-b", name: "Cluster B" },
            deleteTopic: async (request: { topics: string[]; }) => {
                deleteCalls.push({ clusterId: "cluster-b", topics: request.topics });
            }
        };

        const explorer = {
            refreshCalls: 0,
            refresh() {
                this.refreshCalls++;
            }
        };

        const originalPickClient = (common as any).pickClient;
        const originalShowWarningMessage = (vscode.window as any).showWarningMessage;
        const originalShowInformationMessage = (vscode.window as any).showInformationMessage;
        const originalGetAutoCreateTopicEnabled = (BrokerConfigs as any).getAutoCreateTopicEnabled;

        try {
            (common as any).pickClient = async (_clientAccessor: unknown, clusterId?: string) => {
                if (clusterId === "cluster-a") {
                    return clientA;
                }
                if (clusterId === "cluster-b") {
                    return clientB;
                }
                return undefined;
            };

            (BrokerConfigs as any).getAutoCreateTopicEnabled = async (client: { cluster: { id: string; }; }) => {
                return { type: client.cluster.id === "cluster-a" ? "enabled" : "disabled" };
            };

            (vscode.window as any).showWarningMessage = async (message: string) => {
                warningMessages.push(message);
                return "Delete";
            };
            (vscode.window as any).showInformationMessage = async (message: string) => {
                infoMessages.push(message);
                return undefined;
            };

            const handler = new DeleteTopicCommandHandler({} as any, explorer as any);
            await handler.execute([
                { clusterId: "cluster-a", topic: { id: "topic-a1" } },
                { clusterId: "cluster-a", topic: { id: "topic-a2" } },
                { clusterId: "cluster-b", topic: { id: "topic-b1" } }
            ] as any);

            assert.strictEqual(deleteCalls.length, 2);
            assert.deepStrictEqual(deleteCalls[0], { clusterId: "cluster-a", topics: ["topic-a1", "topic-a2"] });
            assert.deepStrictEqual(deleteCalls[1], { clusterId: "cluster-b", topics: ["topic-b1"] });
            assert.strictEqual(explorer.refreshCalls, 1);
            assert.strictEqual(infoMessages[0], "3 topics deleted successfully");
            assert.ok(warningMessages[0].includes("3 topics"));
            assert.ok(warningMessages[0].includes("auto.create.topics.enable=true"));
        } finally {
            (common as any).pickClient = originalPickClient;
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            (vscode.window as any).showInformationMessage = originalShowInformationMessage;
            (BrokerConfigs as any).getAutoCreateTopicEnabled = originalGetAutoCreateTopicEnabled;
        }
    });

    test("deletes multiple topics picked from command", async () => {
        const deleteCalls: { topics: string[]; }[] = [];
        let pickTopicsCalls = 0;

        const client = {
            cluster: { id: "cluster-a", name: "Cluster A" },
            deleteTopic: async (request: { topics: string[]; }) => {
                deleteCalls.push({ topics: request.topics });
            }
        };

        const explorer = {
            refreshCalls: 0,
            refresh() {
                this.refreshCalls++;
            }
        };

        const originalPickClient = (common as any).pickClient;
        const originalPickTopics = (common as any).pickTopics;
        const originalShowWarningMessage = (vscode.window as any).showWarningMessage;
        const originalGetAutoCreateTopicEnabled = (BrokerConfigs as any).getAutoCreateTopicEnabled;

        try {
            (common as any).pickClient = async () => client;
            (common as any).pickTopics = async () => {
                pickTopicsCalls++;
                return [{ id: "topic-1" }, { id: "topic-2" }];
            };
            (BrokerConfigs as any).getAutoCreateTopicEnabled = async () => ({ type: "disabled" });
            (vscode.window as any).showWarningMessage = async () => "Delete";

            const handler = new DeleteTopicCommandHandler({} as any, explorer as any);
            await handler.execute();

            assert.strictEqual(pickTopicsCalls, 1);
            assert.strictEqual(deleteCalls.length, 1);
            assert.deepStrictEqual(deleteCalls[0], { topics: ["topic-1", "topic-2"] });
            assert.strictEqual(explorer.refreshCalls, 1);
        } finally {
            (common as any).pickClient = originalPickClient;
            (common as any).pickTopics = originalPickTopics;
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            (BrokerConfigs as any).getAutoCreateTopicEnabled = originalGetAutoCreateTopicEnabled;
        }
    });

    test("does not delete when confirmation is cancelled", async () => {
        const deleteCalls: { topics: string[]; }[] = [];

        const client = {
            cluster: { id: "cluster-a", name: "Cluster A" },
            deleteTopic: async (request: { topics: string[]; }) => {
                deleteCalls.push({ topics: request.topics });
            }
        };

        const explorer = {
            refreshCalls: 0,
            refresh() {
                this.refreshCalls++;
            }
        };

        const originalPickClient = (common as any).pickClient;
        const originalShowWarningMessage = (vscode.window as any).showWarningMessage;
        const originalGetAutoCreateTopicEnabled = (BrokerConfigs as any).getAutoCreateTopicEnabled;

        try {
            (common as any).pickClient = async () => client;
            (BrokerConfigs as any).getAutoCreateTopicEnabled = async () => ({ type: "disabled" });
            (vscode.window as any).showWarningMessage = async () => "Cancel";

            const handler = new DeleteTopicCommandHandler({} as any, explorer as any);
            await handler.execute([{ clusterId: "cluster-a", topic: { id: "topic-1" } }] as any);

            assert.strictEqual(deleteCalls.length, 0);
            assert.strictEqual(explorer.refreshCalls, 0);
        } finally {
            (common as any).pickClient = originalPickClient;
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            (BrokerConfigs as any).getAutoCreateTopicEnabled = originalGetAutoCreateTopicEnabled;
        }
    });
});
