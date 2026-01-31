import { createClient, Client } from "./client";
import { getClusterSettings, ClusterSettings, getWorkspaceSettings } from "../settings";
import { Disposable, EventEmitter } from "vscode";

export enum ClientState {
    connecting,
    connected,
    invalid,
    disconnecting,
    disconnected
}

interface ClientStateEvent {
    client: Client;
}

/**
 * Represents an accessor for retrieving the kafka client used for a cluster.
 */
export class ClientAccessor implements Disposable {

    private static instance: ClientAccessor;
    private clientsById: { [id: string]: Client } = {};
    private clusterSettings: ClusterSettings;
    private onDidChangeClientStateEmitter = new EventEmitter<ClientStateEvent>();

    public onDidChangeClientState = this.onDidChangeClientStateEmitter.event;

    constructor(clusterSettings: ClusterSettings) {
        this.clusterSettings = clusterSettings;
    }

    public async get(clusterId: string): Promise<Client> {
        if (!this.has(clusterId)) {
            const cluster = await this.clusterSettings.getWithCredentials(clusterId);

            if (!cluster) {
                throw new Error("Unknown cluster when attempting to create client");
            }

            this.clientsById[clusterId] = createClient(cluster, getWorkspaceSettings());
        }

        return this.clientsById[clusterId];
    }

    public has(clusterId: string): boolean {
        return this.clientsById.hasOwnProperty(clusterId);
    }

    public async getState(clusterId: string): Promise<ClientState> {
        if (!this.has(clusterId)) {
            return ClientState.disconnected;
        }
        const client = await this.get(clusterId);
        return client.state;
    }

    changeState(client: Client, state: ClientState) {
        client.state = state;
        this.onDidChangeClientStateEmitter.fire({
            client
        });
    }

    public async getSelectedClusterClient(): Promise<Client | undefined> {
        const selectedCluster = this.clusterSettings.selected;

        if (!selectedCluster) {
            return undefined;
        }

        return await this.get(selectedCluster.id);
    }

    public async remove(clusterId: string): Promise<void> {
        if (!this.has(clusterId)) {
            return;
        }

        const client = await this.get(clusterId);
        this.changeState(client, ClientState.disconnecting);
        client.dispose();
        this.changeState(client, ClientState.disconnected);
        delete this.clientsById[clusterId];
    }

    public async dispose(clusterProviderIds?: string[]): Promise<void> {
        for (const clusterId of Object.keys(this.clientsById)) {
            if (await this.shouldBeDisposed(clusterId, clusterProviderIds)) {
                await this.remove(clusterId);
            }
        }
    }

    private async shouldBeDisposed(clusterId: string, clusterProviderIds?: string[] | undefined): Promise<boolean> {
        if (!clusterProviderIds) {
            return true;
        }
        if (this.has(clusterId)) {
            const client = await this.get(clusterId);
            const clusterProviderId = client.cluster.clusterProviderId;
            if (!clusterProviderId) {
                return true;
            }
            return clusterProviderIds.indexOf(clusterProviderId) !== -1;
        }
        return true;
    }

    public static getInstance(): ClientAccessor {
        if (!ClientAccessor.instance) {
            ClientAccessor.instance = new ClientAccessor(getClusterSettings());
        }

        return ClientAccessor.instance;
    }
}

export const getClientAccessor = (): ClientAccessor => ClientAccessor.getInstance();

export * from "./client";
export * from "./consumer";
