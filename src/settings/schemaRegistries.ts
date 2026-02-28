import * as vscode from "vscode";

import { SecretsStorage } from "./secretsStorage";
import { SchemaRegistry } from "../schema-registry/types";

export interface SchemaRegistrySettings {
    getAll(): SchemaRegistry[];
    get(id: string): SchemaRegistry | undefined;
    getWithCredentials(id: string): Promise<SchemaRegistry | undefined>;
    upsert(schemaRegistry: SchemaRegistry): Promise<void>;
    remove(id: string): Promise<void>;
}

class SettingsSchemaRegistrySettings implements SchemaRegistrySettings {
    private static instance: SettingsSchemaRegistrySettings;

    static getInstance(): SettingsSchemaRegistrySettings {
        if (!SettingsSchemaRegistrySettings.instance) {
            SettingsSchemaRegistrySettings.instance = new SettingsSchemaRegistrySettings();
        }

        return SettingsSchemaRegistrySettings.instance;
    }

    getAll(): SchemaRegistry[] {
        const schemaRegistries = this.getSchemaRegistriesFromGlobalConfig();
        return schemaRegistries.sort(this.sortByNameAscending);
    }

    get(id: string): SchemaRegistry | undefined {
        const schemaRegistries = this.getAll();
        return schemaRegistries.find(schemaRegistry => schemaRegistry.id === id);
    }

    async getWithCredentials(id: string): Promise<SchemaRegistry | undefined> {
        const schemaRegistry = this.get(id);
        if (!schemaRegistry) {
            return undefined;
        }

        if (!schemaRegistry.connection.auth?.username) {
            return schemaRegistry;
        }

        const password = await SecretsStorage.getInstance().getSecret(id, "schemaRegistryPassword");
        return {
            ...schemaRegistry,
            connection: {
                ...schemaRegistry.connection,
                auth: {
                    ...schemaRegistry.connection.auth,
                    password: password || schemaRegistry.connection.auth.password
                }
            }
        };
    }

    async upsert(schemaRegistry: SchemaRegistry): Promise<void> {
        const config = vscode.workspace.getConfiguration("kafka");
        const schemaRegistries = this.getSchemaRegistriesFromGlobalConfig();
        const secretsStorage = SecretsStorage.getInstance();
        const password = schemaRegistry.connection.auth?.password;

        const schemaRegistryWithoutSecrets: SchemaRegistry = {
            ...schemaRegistry,
            connection: {
                ...schemaRegistry.connection,
                auth: schemaRegistry.connection.auth ? {
                    ...schemaRegistry.connection.auth,
                    password: undefined
                } : undefined
            }
        };

        const existingIndex = schemaRegistries.findIndex(current => current.id === schemaRegistry.id);
        if (existingIndex >= 0) {
            schemaRegistries[existingIndex] = schemaRegistryWithoutSecrets;
        } else {
            schemaRegistries.push(schemaRegistryWithoutSecrets);
        }

        await config.update("schemaRegistries", schemaRegistries, vscode.ConfigurationTarget.Global);

        await secretsStorage.deleteSecret(schemaRegistry.id, "schemaRegistryPassword");
        if (schemaRegistry.connection.auth?.username && password) {
            await secretsStorage.storeSecret(schemaRegistry.id, "schemaRegistryPassword", password);
        }
    }

    async remove(id: string): Promise<void> {
        const config = vscode.workspace.getConfiguration("kafka");
        const schemaRegistries = this.getSchemaRegistriesFromGlobalConfig();
        const filtered = schemaRegistries.filter(schemaRegistry => schemaRegistry.id !== id);

        await config.update("schemaRegistries", filtered, vscode.ConfigurationTarget.Global);
        await SecretsStorage.getInstance().deleteSecret(id, "schemaRegistryPassword");
    }

    private sortByNameAscending(a: SchemaRegistry, b: SchemaRegistry): -1 | 0 | 1 {
        if (a.name.toLowerCase() < b.name.toLowerCase()) {
            return -1;
        }
        if (a.name.toLowerCase() > b.name.toLowerCase()) {
            return 1;
        }
        return 0;
    }

    private getSchemaRegistriesFromGlobalConfig(): SchemaRegistry[] {
        const config = vscode.workspace.getConfiguration("kafka");
        const inspection = config.inspect<SchemaRegistry[]>("schemaRegistries");
        const schemaRegistries = inspection?.globalValue ?? inspection?.defaultValue ?? [];

        if (!Array.isArray(schemaRegistries)) {
            console.error("kafka.schemaRegistries setting is not an array. Inspection:", JSON.stringify(inspection));
            return [];
        }

        return schemaRegistries;
    }
}

export const getSchemaRegistrySettings = (): SchemaRegistrySettings => SettingsSchemaRegistrySettings.getInstance();
