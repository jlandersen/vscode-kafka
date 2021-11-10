import * as vscode from "vscode";
import { Cluster } from "../client";
import { Context } from "../context";

export interface SelectedClusterChangedEvent {
    oldClusterId?: string,
    newClusterId?: string;
}

/**
 * Represents the cluster settings.
 */
export interface ClusterSettings {
    /**
     * Gets or sets the selected cluster.
     */
    selected: Cluster | undefined;

    /**
     * Gets the event to subscribe to selected cluster changes.
     */
    onDidChangeSelected: vscode.Event<SelectedClusterChangedEvent>;

    /**
     * Gets the full cluster collection sorted by cluster name.
     */
    getAll(): Cluster[];

    /**
     * Gets a cluster by id.
     * @param id The cluster id.
     */
    get(id: string): Cluster | undefined;

    /**
     * Upserts a cluster.
     * @param cluster The cluster to update.
     */
    upsert(cluster: Cluster): void;

    /**
     * Removes a cluster from the collection.
     */
    remove(id: string): void;
}

type ClusterStoreType = { [id: string]: Cluster };

/**
 * An implementation of {@link ClusterSettings} that stores settings using the VS Code memento API.
 */
class MementoClusterSettings implements ClusterSettings {
    private static instance: MementoClusterSettings;
    private readonly selectedClusterIdStorageKey = "selectedcluster";
    private readonly clusterCollectionStorageKey = "clusters";
    private readonly storage: vscode.Memento;
    private readonly onDidChangeSelectedEmitter = new vscode.EventEmitter<SelectedClusterChangedEvent>();
    public readonly onDidChangeSelected = this.onDidChangeSelectedEmitter.event;

    public constructor(storage: vscode.Memento) {
        this.storage = storage;
        this.setSelectedClusterIfNeeded();
    }

    get selected(): Cluster | undefined {
        const selectedClusterId = this.storage.get<string>(this.selectedClusterIdStorageKey);

        if (!selectedClusterId) {
            return undefined;
        }

        return this.get(selectedClusterId);
    }

    set selected(value: Cluster | undefined) {
        const oldClusterId = this.selected?.id;
        this.storage.update(this.selectedClusterIdStorageKey, value?.id);
        this.onDidChangeSelectedEmitter.fire({ oldClusterId: oldClusterId, newClusterId: value?.id });
    }

    getAll(): Cluster[] {
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        return Object.values(state)
            .sort(this.sortByNameAscending);
    }

    private sortByNameAscending(a: Cluster, b: Cluster): -1 | 0 | 1 {
        if (a.name && b.name) {
            if (a.name.toLowerCase() < b.name.toLowerCase()) { return -1; }
            if (a.name.toLowerCase() > b.name.toLowerCase()) { return 1; }
        }
        return 0;
    }

    get(id: string): Cluster | undefined {
        return this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {})[id];
    }

    upsert(cluster: Cluster): void {
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        state[cluster.id] = cluster;
        this.storage.update(this.clusterCollectionStorageKey, state);
        if (this.selected?.id === cluster.id) {
            // This usecase comes from when a cluster which is selected is updated
            // In this case we need to fire a select event to update status bar with the new cluster name.
            this.selected = cluster;
        }
        this.setSelectedClusterIfNeeded();
    }

    remove(id: string): void {
        if (this.selected?.id === id) {
            this.selected = undefined;
        }

        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        delete state[id];
        this.storage.update(this.clusterCollectionStorageKey, state);
        this.setSelectedClusterIfNeeded();
    }

    static getInstance(): MementoClusterSettings {
        if (!MementoClusterSettings.instance) {
            MementoClusterSettings.instance = new MementoClusterSettings(Context.current.globalState);
        }

        return MementoClusterSettings.instance;
    }

    private setSelectedClusterIfNeeded(): void {
        if (this.selected !== undefined) {
            return;
        }
        const all = this.getAll();
        if (all && all.length === 1) {
            this.selected = all[0];
        }
    }
}

export const getClusterSettings = (): ClusterSettings => MementoClusterSettings.getInstance();
