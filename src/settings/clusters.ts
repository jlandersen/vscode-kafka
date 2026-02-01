import * as vscode from "vscode";
import { Cluster } from "../client";
import { Context } from "../context";
import { SecretsStorage } from "./secretsStorage";

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
     * Note: Passwords are not included in the returned clusters.
     */
    getAll(): Cluster[];

    /**
     * Gets a cluster by id without password.
     * Use getWithCredentials() when password is needed for connection.
     * @param id The cluster id.
     */
    get(id: string): Cluster | undefined;

    /**
     * Gets a cluster by id with password loaded from secure storage.
     * @param id The cluster id.
     */
    getWithCredentials(id: string): Promise<Cluster | undefined>;

    /**
     * Upserts a cluster and securely stores its password.
     * @param cluster The cluster to update.
     */
    upsert(cluster: Cluster): Promise<void>;

    /**
     * Removes a cluster from the collection and deletes its password from secure storage.
     */
    remove(id: string): Promise<void>;
}

type ClusterStoreType = { [id: string]: Cluster };

/**
 * An implementation of {@link ClusterSettings} that stores settings using the VS Code memento API
 * and passwords using the VS Code SecretStorage API for enhanced security.
 */
class MementoClusterSettings implements ClusterSettings {
    private static instance: MementoClusterSettings;
    private readonly selectedClusterIdStorageKey = "selectedcluster";
    private readonly clusterCollectionStorageKey = "clusters";
    private readonly migrationCompletedKey = "secretsMigrationCompleted";
    private readonly storage: vscode.Memento;
    private readonly onDidChangeSelectedEmitter = new vscode.EventEmitter<SelectedClusterChangedEvent>();
    public readonly onDidChangeSelected = this.onDidChangeSelectedEmitter.event;
    private migrationPromise?: Promise<void>;

    public constructor(storage: vscode.Memento) {
        this.storage = storage;
        this.migrationPromise = this.migratePasswordsToSecrets();
        this.setSelectedClusterIfNeeded();
    }

    get selected(): Cluster | undefined {
        const selectedClusterId = this.storage.get<string>(this.selectedClusterIdStorageKey);

        if (!selectedClusterId) {
            return undefined;
        }

        // Return cluster without password for synchronous access
        // Password will need to be loaded separately via get() for actual connections
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        return state[selectedClusterId];
    }

    set selected(value: Cluster | undefined) {
        const oldClusterId = this.selected?.id;
        this.storage.update(this.selectedClusterIdStorageKey, value?.id);
        this.onDidChangeSelectedEmitter.fire({ oldClusterId: oldClusterId, newClusterId: value?.id });
    }

    getAll(): Cluster[] {
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        // Return clusters without passwords for synchronous access
        // Passwords will need to be loaded separately via get() for actual connections
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
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        // Return cluster without password for synchronous access
        return state[id];
    }

    async getWithCredentials(id: string): Promise<Cluster | undefined> {
        await this.migrationPromise;
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        const cluster = state[id];
        
        if (!cluster) {
            return undefined;
        }

        // Load secrets from secure storage based on the authentication mechanism
        if (cluster.saslOption) {
            const secretsStorage = SecretsStorage.getInstance();
            const mechanism = cluster.saslOption.mechanism;

            if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
                // Load password for username/password auth
                const password = await secretsStorage.getPassword(id);
                return {
                    ...cluster,
                    saslOption: {
                        ...cluster.saslOption,
                        password: password
                    }
                };
            } else if (mechanism === 'oauthbearer') {
                // Load client secret for OAUTHBEARER
                const oauthClientSecret = await secretsStorage.getSecret(id, 'oauthClientSecret');
                return {
                    ...cluster,
                    saslOption: {
                        ...cluster.saslOption,
                        oauthClientSecret: oauthClientSecret
                    }
                };
            } else if (mechanism === 'aws') {
                // Load AWS secrets
                const [awsSecretAccessKey, awsSessionToken] = await Promise.all([
                    secretsStorage.getSecret(id, 'awsSecretAccessKey'),
                    secretsStorage.getSecret(id, 'awsSessionToken')
                ]);
                return {
                    ...cluster,
                    saslOption: {
                        ...cluster.saslOption,
                        awsSecretAccessKey: awsSecretAccessKey,
                        awsSessionToken: awsSessionToken
                    }
                };
            }
        }

        return cluster;
    }

    async upsert(cluster: Cluster): Promise<void> {
        await this.migrationPromise;
        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        const secretsStorage = SecretsStorage.getInstance();
        
        // Extract all secrets before storing in memento
        const password = cluster.saslOption?.password;
        const oauthClientSecret = cluster.saslOption?.oauthClientSecret;
        const awsSecretAccessKey = cluster.saslOption?.awsSecretAccessKey;
        const awsSessionToken = cluster.saslOption?.awsSessionToken;
        
        // Create cluster without secrets for memento storage
        const clusterWithoutSecrets = {
            ...cluster,
            saslOption: cluster.saslOption ? {
                ...cluster.saslOption,
                password: undefined,
                oauthClientSecret: undefined,
                awsSecretAccessKey: undefined,
                awsSessionToken: undefined
            } : undefined
        };

        state[cluster.id] = clusterWithoutSecrets;
        await this.storage.update(this.clusterCollectionStorageKey, state);

        // Store secrets based on the mechanism
        if (cluster.saslOption) {
            const mechanism = cluster.saslOption.mechanism;
            
            // Clear all secrets first, then store the relevant ones
            await secretsStorage.deleteAllSecrets(cluster.id);

            if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
                if (password) {
                    await secretsStorage.storePassword(cluster.id, password);
                }
            } else if (mechanism === 'oauthbearer') {
                if (oauthClientSecret) {
                    await secretsStorage.storeSecret(cluster.id, 'oauthClientSecret', oauthClientSecret);
                }
            } else if (mechanism === 'aws') {
                if (awsSecretAccessKey) {
                    await secretsStorage.storeSecret(cluster.id, 'awsSecretAccessKey', awsSecretAccessKey);
                }
                if (awsSessionToken) {
                    await secretsStorage.storeSecret(cluster.id, 'awsSessionToken', awsSessionToken);
                }
            }
        } else {
            // No SASL option, clear all secrets
            await secretsStorage.deleteAllSecrets(cluster.id);
        }

        if (this.selected?.id === cluster.id) {
            // This usecase comes from when a cluster which is selected is updated
            // In this case we need to fire a select event to update status bar with the new cluster name.
            this.selected = clusterWithoutSecrets;
        }
        this.setSelectedClusterIfNeeded();
    }

    async remove(id: string): Promise<void> {
        await this.migrationPromise;
        
        if (this.selected?.id === id) {
            this.selected = undefined;
        }

        const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
        delete state[id];
        await this.storage.update(this.clusterCollectionStorageKey, state);
        
        // Delete all secrets from secure storage
        await SecretsStorage.getInstance().deleteAllSecrets(id);
        
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

    /**
     * Migrates existing plain-text passwords from globalState to SecretStorage.
     * This is a one-time migration that runs on extension activation.
     */
    private async migratePasswordsToSecrets(): Promise<void> {
        const migrationCompleted = this.storage.get<boolean>(this.migrationCompletedKey, false);
        
        if (migrationCompleted) {
            return; // Migration already done
        }

        try {
            const state = this.storage.get<ClusterStoreType>(this.clusterCollectionStorageKey, {});
            const clusters = Object.values(state);
            const secretsStorage = SecretsStorage.getInstance();
            
            // Migrate each cluster's password
            for (const cluster of clusters) {
                if (cluster.saslOption?.password) {
                    // Store password in secure storage
                    await secretsStorage.storePassword(cluster.id, cluster.saslOption.password);
                    
                    // Remove password from memento storage
                    cluster.saslOption.password = undefined;
                    state[cluster.id] = cluster;
                }
            }

            // Update storage without passwords
            await this.storage.update(this.clusterCollectionStorageKey, state);
            
            // Mark migration as completed
            await this.storage.update(this.migrationCompletedKey, true);
            
            // Show appropriate message based on storage mode
            if (secretsStorage.isInFallbackMode()) {
                vscode.window.showWarningMessage(
                    'Kafka: Secure credential storage is not available in this environment. Passwords will be stored with basic encoding.',
                    'Learn More'
                ).then(selection => {
                    if (selection === 'Learn More') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/eclipse-theia/theia/issues/9348'));
                    }
                });
            } else {
                vscode.window.showInformationMessage(
                    'Kafka cluster passwords have been migrated to secure storage.'
                );
            }
        } catch (error) {
            console.error('Failed to migrate passwords to secure storage:', error);
            // Don't throw - allow extension to continue functioning
            // User can manually re-enter credentials if needed
        }
    }
}

export const getClusterSettings = (): ClusterSettings => MementoClusterSettings.getInstance();
