import * as assert from "assert";

import { Context } from "../../../context";
import { InformationItem, ErrorItem } from "../../../explorer/models/common";
import { SchemaRegistriesItem, SchemaRegistryNode, TopicSchemaSubjectsItem } from "../../../explorer/models/schemaRegistry";
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
        assert.ok(errorChildren[0] instanceof ErrorItem);
        assert.strictEqual(errorChildren[0].label, "Failed to load subjects: Schema Registry authentication failed. Check username/password.");
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

        const nonDeterministicFactory: SchemaRegistryProviderFactory = {
            getRegistryRef: async () => ({
                ...createRegistryRef(),
                connection: {
                    ...createRegistryRef().connection,
                    namingStrategy: "RecordNameStrategy"
                }
            }),
            getProvider: () => createProvider(["orders-value", "orders-key"], [1], [])
        };
        const nonDeterministicItem = new TopicSchemaSubjectsItem(topicItem, nonDeterministicFactory);
        assert.strictEqual(await nonDeterministicItem.hasDiscoverableSubjects(), false);
        const nonDeterministicChildren = await nonDeterministicItem.getChildren();
        assert.strictEqual(nonDeterministicChildren.length, 1);
        assert.ok(nonDeterministicChildren[0] instanceof InformationItem);
        assert.strictEqual(nonDeterministicChildren[0].label, "No discoverable subjects");
    });
});

function createRegistryRef(): SchemaRegistryRef {
    return {
        id: "registry-1",
        name: "Local Registry",
        clusterId: "cluster-1",
        clusterName: "Cluster 1",
        connection: {
            url: "http://localhost:8081",
            namingStrategy: "TopicNameStrategy"
        }
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
