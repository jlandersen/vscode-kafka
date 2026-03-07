import * as assert from "assert";
import { PlatformaticClient, PlatformaticClientConfig, Cluster } from "../../../client/client";

/**
 * Creates a mock Admin object that returns Map-based data matching
 * @platformatic/kafka's actual API surface.
 */
function createMockAdmin(options: {
    topicNames?: string[];
    topicMetadata?: Map<string, any>;
    brokerMetadata?: { brokers: Map<number, any>; controllerId: number };
}) {
    const calls: Record<string, any[][]> = {};

    function record(name: string, ...args: any[]) {
        if (!calls[name]) { calls[name] = []; }
        calls[name].push(args);
    }

    return {
        listTopics() {
            record("listTopics");
            return Promise.resolve(options.topicNames ?? []);
        },
        metadata(opts: any) {
            record("metadata", opts);
            if (options.brokerMetadata && (!opts.topics || opts.topics.length === 0)) {
                return Promise.resolve(options.brokerMetadata);
            }
            return Promise.resolve({
                topics: options.topicMetadata ?? new Map(),
                brokers: options.brokerMetadata?.brokers ?? new Map(),
                controllerId: options.brokerMetadata?.controllerId ?? 0,
            });
        },
        close() {},
        clearMetadata() {},
        calls,
    };
}

/**
 * Testable subclass of PlatformaticClient that injects a mock Admin.
 */
class TestableClient extends PlatformaticClient {
    private mockAdmin: any;

    constructor(mockAdmin: any) {
        const cluster: Cluster = {
            id: "test",
            name: "Test",
            bootstrap: "localhost:9092",
        };
        const config: PlatformaticClientConfig = {
            clientId: "test",
            bootstrapBrokers: ["localhost:9092"],
        };
        super(cluster, config);
        this.mockAdmin = mockAdmin;
    }

    protected override async getKafkaAdminClient(): Promise<any> {
        return this.mockAdmin;
    }
}

suite("Admin Adapter Test Suite", () => {

    suite("getTopics", () => {

        test("returns empty array when no topics exist", async () => {
            const admin = createMockAdmin({ topicNames: [] });
            const client = new TestableClient(admin);
            const topics = await client.getTopics();

            assert.deepStrictEqual(topics, []);
            assert.strictEqual(admin.calls["listTopics"].length, 1);
            assert.strictEqual(admin.calls["metadata"], undefined);
        });

        test("calls listTopics then metadata with topic names", async () => {
            const topicMeta = new Map();
            topicMeta.set("topic-a", {
                partitionsCount: 2,
                partitions: [
                    { leader: 1, replicas: [1, 2], isr: [1, 2] },
                    { leader: 2, replicas: [2, 1], isr: [2] },
                ],
            });

            const admin = createMockAdmin({
                topicNames: ["topic-a"],
                topicMetadata: topicMeta,
            });
            const client = new TestableClient(admin);
            const topics = await client.getTopics();

            // Verify listTopics was called first
            assert.strictEqual(admin.calls["listTopics"].length, 1);

            // Verify metadata was called with the topic names from listTopics
            assert.strictEqual(admin.calls["metadata"].length, 1);
            const metadataArg = admin.calls["metadata"][0][0];
            assert.deepStrictEqual(metadataArg.topics, ["topic-a"]);

            // Verify Map→Array conversion
            assert.strictEqual(topics.length, 1);
            assert.strictEqual(topics[0].id, "topic-a");
            assert.strictEqual(topics[0].partitionCount, 2);
            assert.strictEqual(topics[0].replicationFactor, 2);
        });

        test("converts partition metadata correctly", async () => {
            const topicMeta = new Map();
            topicMeta.set("t", {
                partitionsCount: 1,
                partitions: [
                    { leader: 3, replicas: [3, 1], isr: [3] },
                ],
            });

            const admin = createMockAdmin({
                topicNames: ["t"],
                topicMetadata: topicMeta,
            });
            const client = new TestableClient(admin);
            const topics = await client.getTopics();

            const p = topics[0].partitions["0"];
            assert.strictEqual(p.partition, "0");
            assert.strictEqual(p.leader, "3");
            assert.deepStrictEqual(p.replicas, ["3", "1"]);
            assert.deepStrictEqual(p.isr, ["3"]);
        });

        test("handles multiple topics", async () => {
            const topicMeta = new Map();
            topicMeta.set("alpha", {
                partitionsCount: 1,
                partitions: [{ leader: 1, replicas: [1], isr: [1] }],
            });
            topicMeta.set("beta", {
                partitionsCount: 3,
                partitions: [
                    { leader: 1, replicas: [1], isr: [1] },
                    { leader: 2, replicas: [2], isr: [2] },
                    { leader: 1, replicas: [1], isr: [1] },
                ],
            });

            const admin = createMockAdmin({
                topicNames: ["alpha", "beta"],
                topicMetadata: topicMeta,
            });
            const client = new TestableClient(admin);
            const topics = await client.getTopics();

            assert.strictEqual(topics.length, 2);
            const alpha = topics.find(t => t.id === "alpha");
            const beta = topics.find(t => t.id === "beta");
            assert.strictEqual(alpha?.partitionCount, 1);
            assert.strictEqual(beta?.partitionCount, 3);
        });
    });

    suite("getBrokers", () => {

        test("converts broker Map to array", async () => {
            const brokers = new Map<number, any>();
            brokers.set(1, { host: "broker1.example.com", port: 9092 });
            brokers.set(2, { host: "broker2.example.com", port: 9093 });

            const admin = createMockAdmin({
                brokerMetadata: { brokers, controllerId: 1 },
            });
            const client = new TestableClient(admin);
            const result = await client.getBrokers();

            assert.strictEqual(result.length, 2);

            const b1 = result.find(b => b.id === "1");
            const b2 = result.find(b => b.id === "2");
            assert.ok(b1);
            assert.strictEqual(b1.host, "broker1.example.com");
            assert.strictEqual(b1.port, 9092);
            assert.strictEqual(b1.isController, true);

            assert.ok(b2);
            assert.strictEqual(b2.host, "broker2.example.com");
            assert.strictEqual(b2.port, 9093);
            assert.strictEqual(b2.isController, false);
        });

        test("calls metadata with empty object for all brokers", async () => {
            const brokers = new Map<number, any>();
            brokers.set(0, { host: "localhost", port: 9092 });

            const admin = createMockAdmin({
                brokerMetadata: { brokers, controllerId: 0 },
            });
            const client = new TestableClient(admin);
            await client.getBrokers();

            assert.strictEqual(admin.calls["metadata"].length, 1);
            const metadataArg = admin.calls["metadata"][0][0];
            assert.deepStrictEqual(metadataArg, {});
        });
    });
});
