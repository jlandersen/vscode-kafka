import * as assert from "assert";

import { Cluster } from "../../../client";
import { DefaultSchemaRegistryProviderFactory, SchemaRegistry, SchemaRegistryProvider, SchemaRegistryProviderFactory, SchemaRegistryRef } from "../../../schema-registry";
import { SchemaRegistrySettings } from "../../../settings";

suite("Schema Registry Provider Factory Test Suite", () => {
    test("returns provider only when registry has url", () => {
        const provider: SchemaRegistryProvider = {
            listSubjects: async () => [],
            listSubjectVersions: async () => [],
            getSchemaVersion: async () => {
                throw new Error("not implemented");
            }
        };
        const settings = createSettingsStub(undefined);
        const factory: SchemaRegistryProviderFactory = new DefaultSchemaRegistryProviderFactory(provider, settings);

        assert.strictEqual(factory.getProvider(undefined), undefined);
        assert.strictEqual(factory.getProvider({ connection: { url: "" } } as SchemaRegistryRef), undefined);
        assert.strictEqual(factory.getProvider({ connection: { url: "http://localhost:8081" } } as SchemaRegistryRef), provider);
    });

    test("returns undefined registry when cluster has no schemaRegistryId", async () => {
        const settings = createSettingsStub({
            id: "registry-1",
            name: "Registry 1",
            connection: { url: "http://localhost:8081" }
        });
        const factory = new DefaultSchemaRegistryProviderFactory(undefined, settings);

        const result = await factory.getRegistryRef({
            id: "cluster-1",
            name: "Cluster 1",
            bootstrap: "localhost:9092"
        });

        assert.strictEqual(result, undefined);
    });

    test("returns undefined registry when linked id does not exist", async () => {
        const settings = createSettingsStub(undefined);
        const factory = new DefaultSchemaRegistryProviderFactory(undefined, settings);

        const result = await factory.getRegistryRef({
            id: "cluster-1",
            name: "Cluster 1",
            bootstrap: "localhost:9092",
            schemaRegistryId: "missing"
        });

        assert.strictEqual(result, undefined);
    });

    test("maps cluster and linked schema registry into registry ref", async () => {
        const settings = createSettingsStub({
            id: "registry-1",
            name: "Registry 1",
            connection: { url: "http://localhost:8081", namingStrategy: "TopicNameStrategy" }
        });
        const factory = new DefaultSchemaRegistryProviderFactory(undefined, settings);
        const cluster: Cluster = {
            id: "cluster-1",
            name: "Cluster 1",
            bootstrap: "localhost:9092",
            schemaRegistryId: "registry-1"
        };

        const result = await factory.getRegistryRef(cluster);

        assert.deepStrictEqual(result, {
            id: "registry-1",
            name: "Registry 1",
            clusterId: "cluster-1",
            clusterName: "Cluster 1",
            connection: { url: "http://localhost:8081", namingStrategy: "TopicNameStrategy" }
        });
    });
});

function createSettingsStub(
    schemaRegistry: SchemaRegistry | undefined
): SchemaRegistrySettings {
    return {
        getAll: () => schemaRegistry ? [schemaRegistry] : [],
        get: (id: string) => schemaRegistry?.id === id ? schemaRegistry : undefined,
        getWithCredentials: async (id: string) => schemaRegistry?.id === id ? schemaRegistry : undefined,
        upsert: async () => undefined,
        remove: async () => undefined
    };
}
