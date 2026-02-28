import * as assert from "assert";
import * as vscode from "vscode";

import { SchemaRegistry } from "../../../schema-registry";
import { SecretsStorage } from "../../../settings/secretsStorage";
import { getSchemaRegistrySettings, resetSchemaRegistrySettingsForTesting } from "../../../settings/schemaRegistries";

suite("Schema Registry Settings Test Suite", () => {
    suiteSetup(async () => {
        await clearSchemaRegistriesConfig();
    });

    setup(async () => {
        SecretsStorage.initialize(undefined, new InMemoryMemento());
        resetSchemaRegistrySettingsForTesting();
        await clearSchemaRegistriesConfig();
    });

    suiteTeardown(async () => {
        await clearSchemaRegistriesConfig();
    });

    test("getAll returns registries sorted by name", async () => {
        const settings = getSchemaRegistrySettings();
        await settings.upsert({
            id: "registry-b",
            name: "Zoo",
            connection: { url: "http://localhost:8082" }
        });
        await settings.upsert({
            id: "registry-a",
            name: "Alpha",
            connection: { url: "http://localhost:8081" }
        });

        const all = settings.getAll();

        assert.deepStrictEqual(all.map(schemaRegistry => schemaRegistry.name), ["Alpha", "Zoo"]);
    });

    test("upsert stores password in secrets and omits it from configuration", async () => {
        const settings = getSchemaRegistrySettings();
        const schemaRegistry = {
            id: "registry-auth",
            name: "Auth Registry",
            connection: {
                url: "https://registry.example.com",
                auth: {
                    username: "user",
                    password: "secret"
                }
            }
        };

        await settings.upsert(schemaRegistry);

        const settingsValue = readSchemaRegistriesFromConfig();
        assert.strictEqual(settingsValue.length, 1);
        assert.strictEqual(settingsValue[0].connection.auth?.password, undefined);

        const fromSettings = await settings.getWithCredentials("registry-auth");
        assert.strictEqual(fromSettings?.connection.auth?.password, "secret");
    });

    test("remove deletes registry and credential", async () => {
        const settings = getSchemaRegistrySettings();
        await settings.upsert({
            id: "registry-auth",
            name: "Auth Registry",
            connection: {
                url: "https://registry.example.com",
                auth: {
                    username: "user",
                    password: "secret"
                }
            }
        });

        await settings.remove("registry-auth");

        assert.strictEqual(settings.get("registry-auth"), undefined);
        assert.strictEqual(readSchemaRegistriesFromConfig().length, 0);
        assert.strictEqual((await settings.getWithCredentials("registry-auth"))?.connection.auth?.password, undefined);
    });
});

class InMemoryMemento implements vscode.Memento {
    private readonly store = new Map<string, unknown>();

    keys(): readonly string[] {
        return Array.from(this.store.keys());
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        if (!this.store.has(key)) {
            return defaultValue;
        }
        return this.store.get(key) as T;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.store.delete(key);
            return;
        }
        this.store.set(key, value);
    }
}

async function clearSchemaRegistriesConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration("kafka");
    await config.update("schemaRegistries", [], vscode.ConfigurationTarget.Global);
}

function readSchemaRegistriesFromConfig(): SchemaRegistry[] {
    const config = vscode.workspace.getConfiguration("kafka");
    const inspection = config.inspect<SchemaRegistry[]>("schemaRegistries");
    return inspection?.globalValue ?? [];
}
