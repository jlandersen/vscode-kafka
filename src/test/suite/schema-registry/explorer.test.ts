import * as assert from "assert";

import { Context } from "../../../context";
import { InformationItem } from "../../../explorer/models/common";
import { SchemaRegistriesItem, SchemaRegistryErrorItem, SchemaRegistryNode, TopicSchemaSubjectsItem } from "../../../explorer/models/schemaRegistry";
import { SchemaRegistryError, SchemaRegistryProviderFactory, SchemaRegistryRef, SchemaRegistryProvider } from "../../../schema-registry";

suite("Schema Registry Explorer Test Suite", () => {
    suiteSetup(() => {
        Context.register({
            asAbsolutePath: (relativePath: string) => relativePath
        } as any);
    });

    test("schema registries item shows not configured message when registry is missing", async () => {
        const factory: SchemaRegistryProviderFactory = {
            getRegistryRef: async () => undefined,
            getProvider: () => undefined
        };
        const item = new SchemaRegistriesItem(
            {
                cluster: {
                    id: "cluster-1",
                    name: "Cluster 1",
                    bootstrap: "localhost:9092"
                }
            } as any,
            factory
        );

        const children = await item.getChildren();

        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof InformationItem);
        assert.strictEqual(children[0].label, "Schema Registry not configured");
    });

    test("schema registries item returns schema registry node when linked", async () => {
        const registryRef = createRegistryRef();
        const provider = createProvider(["orders-value"], [1], []);
        const factory: SchemaRegistryProviderFactory = {
            getRegistryRef: async () => registryRef,
            getProvider: () => provider
        };
        const item = new SchemaRegistriesItem(
            {
                cluster: {
                    id: "cluster-1",
                    name: "Cluster 1",
                    bootstrap: "localhost:9092"
                }
            } as any,
            factory
        );

        const children = await item.getChildren();

        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof SchemaRegistryNode);
        assert.strictEqual(children[0].label, "Local Registry");
    });

    test("schema registry node sorts subjects and maps provider errors", async () => {
        const sortedNode = new SchemaRegistryNode(
            createRegistryRef(),
            createProvider(["z-subject", "a-subject"], [1], []),
            {} as any
        );
        const sortedChildren = await sortedNode.getChildren();
        assert.deepStrictEqual(sortedChildren.map(child => child.label), ["a-subject", "z-subject"]);

        const failingNode = new SchemaRegistryNode(
            createRegistryRef(),
            {
                listSubjects: async () => {
                    throw new SchemaRegistryError("auth", "Schema Registry authentication failed. Check username/password.");
                },
                listSubjectVersions: async () => [],
                getSchemaVersion: async () => {
                    throw new Error("not used");
                }
            },
            {} as any
        );
        const errorChildren = await failingNode.getChildren();
        assert.strictEqual(errorChildren.length, 1);
        assert.ok(errorChildren[0] instanceof SchemaRegistryErrorItem);
        assert.strictEqual(errorChildren[0].label, "Failed to load subjects: Schema Registry authentication failed. Check username/password.");

        const treeItem = errorChildren[0].getTreeItem();
        assert.strictEqual(treeItem.contextValue, "schemaregistryerror");
        assert.strictEqual(treeItem.command?.command, "vscode-kafka.schemaRegistry.retry");
    });

    test("topic schema subjects item discovers deterministic topic subjects only", async () => {
        const cluster = {
            id: "cluster-1",
            name: "Cluster 1",
            bootstrap: "localhost:9092"
        };
        const topicItem = {
            topic: { id: "orders" },
            getParent: () => ({
                getParent: () => ({ cluster })
            })
        } as any;

        const discoverableFactory: SchemaRegistryProviderFactory = {
            getRegistryRef: async () => createRegistryRef(),
            getProvider: () => createProvider(["orders-value", "orders-key", "payments-value"], [1], [])
        };
        const discoverableItem = new TopicSchemaSubjectsItem(topicItem, discoverableFactory);

        assert.strictEqual(await discoverableItem.hasDiscoverableSubjects(), true);
        const discoverableChildren = await discoverableItem.getChildren();
        assert.deepStrictEqual(discoverableChildren.map(child => child.label), ["orders-key", "orders-value"]);
    });

    test("topic schema subjects item discovers topic-prefixed subjects for TopicRecordNameStrategy", async () => {
        const topicItem = createTopicItem("orders");
        const item = new TopicSchemaSubjectsItem(
            topicItem,
            createFactory(
                createRegistryRef("TopicRecordNameStrategy"),
                createProvider(
                    [
                        "orders-com.acme.OrderCreated",
                        "orders-com.acme.OrderUpdated",
                        "payments-com.acme.PaymentCreated"
                    ],
                    [1],
                    []
                )
            )
        );

        assert.strictEqual(await item.hasDiscoverableSubjects(), true);
        const children = await item.getChildren();
        assert.deepStrictEqual(children.map(child => child.label), ["orders-com.acme.OrderCreated", "orders-com.acme.OrderUpdated"]);
    });

    test("topic schema subjects item discovers single heuristic match for RecordNameStrategy", async () => {
        const topicItem = createTopicItem("orders");
        const item = new TopicSchemaSubjectsItem(
            topicItem,
            createFactory(
                createRegistryRef("RecordNameStrategy"),
                createProvider(
                    [
                        "com.acme.orders.OrderCreated",
                        "com.acme.payments.PaymentCreated"
                    ],
                    [1],
                    []
                )
            )
        );

        assert.strictEqual(await item.hasDiscoverableSubjects(), true);
        const children = await item.getChildren();
        assert.deepStrictEqual(children.map(child => child.label), ["com.acme.orders.OrderCreated"]);
    });

    test("topic schema subjects item shows ambiguity message for RecordNameStrategy", async () => {
        const topicItem = createTopicItem("orders");
        const item = new TopicSchemaSubjectsItem(
            topicItem,
            createFactory(
                createRegistryRef("RecordNameStrategy"),
                createProvider(
                    [
                        "com.acme.orders.OrderCreated",
                        "orders-value"
                    ],
                    [1],
                    []
                )
            )
        );

        assert.strictEqual(await item.hasDiscoverableSubjects(), true);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof InformationItem);
        assert.strictEqual(children[0].label, "Ambiguous subject discovery for RecordNameStrategy");
    });

    test("topic schema subjects item returns no discoverable subjects for RecordNameStrategy without heuristic matches", async () => {
        const topicItem = createTopicItem("orders");
        const item = new TopicSchemaSubjectsItem(
            topicItem,
            createFactory(
                createRegistryRef("RecordNameStrategy"),
                createProvider(["com.acme.payments.PaymentCreated"], [1], [])
            )
        );

        assert.strictEqual(await item.hasDiscoverableSubjects(), false);
        const children = await item.getChildren();
        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof InformationItem);
        assert.strictEqual(children[0].label, "No discoverable subjects");
    });

    test("topic schema subjects items reuse cached subject list across sibling topics", async () => {
        const registryRef: SchemaRegistryRef = {
            id: "registry-cache-test",
            name: "Cache Test Registry",
            clusterId: "cluster-1",
            clusterName: "Cluster 1",
            connection: {
                url: "http://localhost:18081",
                namingStrategy: "TopicNameStrategy"
            }
        };

        let listSubjectsCalls = 0;
        const provider: SchemaRegistryProvider = {
            listSubjects: async () => {
                listSubjectsCalls += 1;
                return [{ name: "orders-value" }, { name: "payments-value" }];
            },
            listSubjectVersions: async () => [],
            getSchemaVersion: async () => {
                throw new Error("not used");
            }
        };
        const factory = createFactory(registryRef, provider);

        const ordersItem = new TopicSchemaSubjectsItem(createTopicItem("orders"), factory);
        const paymentsItem = new TopicSchemaSubjectsItem(createTopicItem("payments"), factory);

        assert.strictEqual(await ordersItem.hasDiscoverableSubjects(), true);
        assert.strictEqual(await paymentsItem.hasDiscoverableSubjects(), true);
        assert.strictEqual(listSubjectsCalls, 1);
    });
});

function createTopicItem(topicId: string): any {
    const cluster = {
        id: "cluster-1",
        name: "Cluster 1",
        bootstrap: "localhost:9092"
    };

    return {
        topic: { id: topicId },
        getParent: () => ({
            getParent: () => ({ cluster })
        })
    };
}

function createRegistryRef(
    namingStrategy: "TopicNameStrategy" | "RecordNameStrategy" | "TopicRecordNameStrategy" = "TopicNameStrategy"
): SchemaRegistryRef {
    return {
        id: "registry-1",
        name: "Local Registry",
        clusterId: "cluster-1",
        clusterName: "Cluster 1",
        connection: {
            url: "http://localhost:8081",
            namingStrategy
        }
    };
}

function createFactory(registryRef: SchemaRegistryRef, provider: SchemaRegistryProvider): SchemaRegistryProviderFactory {
    return {
        getRegistryRef: async () => registryRef,
        getProvider: () => provider
    };
}

function createProvider(
    subjects: string[],
    versions: number[],
    failures: string[]
): SchemaRegistryProvider {
    return {
        listSubjects: async () => {
            if (failures.includes("subjects")) {
                throw new Error("subjects failure");
            }
            return subjects.map(name => ({ name }));
        },
        listSubjectVersions: async (_registryRef, subject) => {
            if (failures.includes("versions")) {
                throw new Error("versions failure");
            }
            return versions.map(version => ({ subject, version }));
        },
        getSchemaVersion: async (_registryRef, subject, version) => {
            if (failures.includes("detail")) {
                throw new Error("detail failure");
            }
            return {
                subject,
                version: version === "latest" ? versions[versions.length - 1] : version,
                schemaType: "AVRO",
                schema: "{\"type\":\"record\"}",
                id: 1,
                references: []
            };
        }
    };
}
