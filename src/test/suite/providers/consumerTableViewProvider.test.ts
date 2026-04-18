import * as assert from "assert";
import * as vscode from "vscode";
import { ConsumerTableViewProvider } from "../../../providers/consumerTableViewProvider";

suite("ConsumerTableViewProvider Test Suite", () => {
    test("applyConsumeSettings closes all matching consumers before restart", async () => {
        const staleConsumerA = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=latest")
        };
        const staleConsumerB = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=earliest")
        };
        const otherConsumer = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-2", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-2?topic=topic-1")
        };

        const closedUris: string[] = [];
        const createdUris: string[] = [];
        const createdConsumer = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=earliest")
        };

        const consumerCollection = {
            getAll: () => [staleConsumerA, staleConsumerB, otherConsumer],
            close: async (uri: vscode.Uri) => {
                closedUris.push(uri.toString());
            },
            create: async (uri: vscode.Uri) => {
                createdUris.push(uri.toString());
                return createdConsumer as any;
            }
        };

        const provider = new ConsumerTableViewProvider(
            vscode.Uri.parse("file:///tmp"),
            consumerCollection as any,
            { get: () => undefined } as any,
            { consumerMessageViewerMaxBufferSize: 100 } as any
        );

        (provider as any).activeConsumerUri = staleConsumerA.uri.toString();
        (provider as any).activeConsumerInfo = {
            clusterId: "cluster-1",
            consumerGroupId: "group-1",
            topicId: "topic-1",
            fromOffset: "latest"
        };
        (provider as any).session = {
            getState: () => ({
                consumeMode: "latest",
                consumeTimestamp: "",
                consumedPartitions: "",
            }),
            resetForConsumeSettings: () => undefined
        };

        await (provider as any).applyConsumeSettings({
            command: "ApplyConsumeSettings",
            consumeMode: "earliest",
            consumedPartitions: "",
            consumeTimestamp: ""
        });

        assert.deepStrictEqual(closedUris, [staleConsumerA.uri.toString(), staleConsumerB.uri.toString()]);
        assert.strictEqual(createdUris.length, 1);
        const createdFromOffset = new URLSearchParams(vscode.Uri.parse(createdUris[0]).query).get("from");
        assert.strictEqual(createdFromOffset, "earliest");
    });

    test("startActiveConsumer closes matching stale consumers before create", async () => {
        const staleConsumerA = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=latest")
        };
        const staleConsumerB = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=earliest")
        };

        const closedUris: string[] = [];
        const createdUris: string[] = [];
        const createdConsumer = {
            clusterId: "cluster-1",
            options: { consumerGroupId: "group-1", topicId: "topic-1" },
            uri: vscode.Uri.parse("kafka:cluster-1/group-1?topic=topic-1&from=earliest")
        };

        const consumerCollection = {
            getAll: () => [staleConsumerA, staleConsumerB],
            close: async (uri: vscode.Uri) => {
                closedUris.push(uri.toString());
            },
            create: async (uri: vscode.Uri) => {
                createdUris.push(uri.toString());
                return createdConsumer as any;
            }
        };

        const provider = new ConsumerTableViewProvider(
            vscode.Uri.parse("file:///tmp"),
            consumerCollection as any,
            { get: () => undefined } as any,
            { consumerMessageViewerMaxBufferSize: 100 } as any
        );

        (provider as any).activeConsumerUri = staleConsumerA.uri.toString();
        (provider as any).activeConsumerInfo = {
            clusterId: "cluster-1",
            consumerGroupId: "group-1",
            topicId: "topic-1",
            fromOffset: "earliest"
        };
        (provider as any).consumer = undefined;

        await (provider as any).startActiveConsumer();

        assert.deepStrictEqual(closedUris, [staleConsumerA.uri.toString(), staleConsumerB.uri.toString()]);
        assert.strictEqual(createdUris.length, 1);
    });

    test("message viewer webview content includes CSP and ready handshake", () => {
        const provider = new ConsumerTableViewProvider(
            vscode.Uri.parse("file:///extension"),
            {} as any,
            { get: () => undefined } as any,
            { consumerMessageViewerMaxBufferSize: 100 } as any
        );
        const webview = {
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: vscode.Uri) => uri
        };

        const html = (provider as any).getWebviewContent(webview);

        assert.ok(html.includes("Content-Security-Policy"));
        assert.ok(html.includes("default-src 'none'; style-src vscode-resource: 'nonce-"));
        assert.ok(html.includes("<style nonce=\""));
        assert.ok(!html.includes("style=\""));
        assert.ok(html.includes("post(\"Ready\")"));
    });

    test("ready handshake sends initial state when session exists", async () => {
        const postedMessages: any[] = [];
        const provider = new ConsumerTableViewProvider(
            vscode.Uri.parse("file:///extension"),
            { get: () => undefined } as any,
            { get: () => ({ name: "Cluster 1" }) } as any,
            { consumerMessageViewerMaxBufferSize: 100 } as any
        );

        (provider as any).panel = {
            webview: {
                postMessage: (message: any) => {
                    postedMessages.push(message);
                    return Promise.resolve(true);
                }
            }
        };
        (provider as any).activeConsumerUri = "kafka:cluster-1/group-1?topic=topic-1";
        (provider as any).activeConsumerInfo = {
            clusterId: "cluster-1",
            consumerGroupId: "group-1",
            topicId: "topic-1",
            fromOffset: "latest"
        };
        (provider as any).session = {
            getState: () => ({
                streamState: "running",
                page: 1,
                pageSize: 100,
                totalPages: 1,
                totalMessages: 0,
                filteredMessages: 0,
                filteredBeforeTimeRange: 0,
                maxBufferSize: 100,
                searchQuery: "",
                availablePartitions: [],
                selectedFilterPartitions: [],
                consumeMode: "latest",
                consumeTimestamp: "",
                consumedPartitions: ""
            }),
            getMessages: () => ({
                page: 1,
                pageSize: 100,
                totalPages: 1,
                messages: []
            }),
            getCounts: () => ({
                total: 0,
                filtered: 0,
                filteredBeforeTimeRange: 0
            }),
            getHistogram: () => ({
                bins: [],
                minTimestampMs: undefined,
                maxTimestampMs: undefined
            })
        };

        await (provider as any).handleWebviewMessage({ command: "Ready" });

        assert.ok(postedMessages.some((message) => message.command === "ConsumerInfo"));
        assert.ok(postedMessages.some((message) => message.command === "ViewerState"));
        assert.ok(postedMessages.some((message) => message.command === "Messages"));
        assert.ok(postedMessages.some((message) => message.command === "MessagesCount"));
        assert.ok(postedMessages.some((message) => message.command === "Histogram"));
    });
});
