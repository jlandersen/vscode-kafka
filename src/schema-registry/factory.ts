import { Cluster } from "../client";
import { getSchemaRegistrySettings, SchemaRegistrySettings } from "../settings";
import { HttpSchemaRegistryProvider } from "./httpSchemaRegistryProvider";
import { SchemaRegistryProvider, SchemaRegistryProviderFactory, SchemaRegistryRef } from "./types";

export class DefaultSchemaRegistryProviderFactory implements SchemaRegistryProviderFactory {
    private readonly provider: SchemaRegistryProvider;
    private readonly schemaRegistrySettings: SchemaRegistrySettings;

    constructor(provider?: SchemaRegistryProvider, schemaRegistrySettings?: SchemaRegistrySettings) {
        this.provider = provider || new HttpSchemaRegistryProvider();
        this.schemaRegistrySettings = schemaRegistrySettings || getSchemaRegistrySettings();
    }

    public getProvider(registryRef: SchemaRegistryRef | undefined): SchemaRegistryProvider | undefined {
        if (!registryRef?.connection.url) {
            return undefined;
        }
        return this.provider;
    }

    public async getRegistryRef(cluster: Cluster): Promise<SchemaRegistryRef | undefined> {
        if (!cluster.schemaRegistryId) {
            return undefined;
        }

        const schemaRegistry = await this.schemaRegistrySettings.getWithCredentials(cluster.schemaRegistryId);
        if (!schemaRegistry?.connection.url) {
            return undefined;
        }

        return {
            id: schemaRegistry.id,
            name: schemaRegistry.name,
            clusterId: cluster.id,
            clusterName: cluster.name,
            connection: schemaRegistry.connection
        };
    }
}
