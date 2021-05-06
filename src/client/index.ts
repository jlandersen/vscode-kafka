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

    public get(clusterId: string): Client {
        if (!this.has(clusterId)) {
            const cluster = this.clusterSettings.get(clusterId);

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

    public getState(clusterId: string): ClientState {
        if (!this.has(clusterId)) {
            return ClientState.disconnected;
        }
        const client = this.get(clusterId);
        return client.state;
    }

    changeState(client: Client, state: ClientState) {
        client.state = state;
        this.onDidChangeClientStateEmitter.fire({
            client
        });
    }

    public getSelectedClusterClient(): Client | undefined {
        const selectedCluster = this.clusterSettings.selected;

        if (!selectedCluster) {
            return undefined;
        }

        return this.get(selectedCluster.id);
    }

    public remove(clusterId: string): void {
        if (!this.has(clusterId)) {
            return;
        }

        const client = this.get(clusterId);
        this.changeState(client, ClientState.disconnecting);
        client.dispose();
        this.changeState(client, ClientState.disconnected);
        delete this.clientsById[clusterId];
    }

    public dispose(clusterProviderIds?: string[]): void {
        for (const clusterId of Object.keys(this.clientsById)) {
            if (this.shouldBeDisposed(clusterId, clusterProviderIds)) {
                this.remove(clusterId);
            }
        }
    }

    private shouldBeDisposed(clusterId: string, clusterProviderIds?: string[] | undefined): boolean {
        if (!clusterProviderIds) {
            return true;
        }
        if (this.has(clusterId)) {
            const clusterProviderId = this.get(clusterId).cluster.clusterProviderId;
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
