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
 * An implementation of {@link ClusterSettings} that stores cluster configurations
 * in VS Code settings.json (machine scope) and passwords in SecretStorage.
 */
class SettingsClusterSettings implements ClusterSettings {
    private static instance: SettingsClusterSettings;
    private readonly onDidChangeSelectedEmitter = new vscode.EventEmitter<SelectedClusterChangedEvent>();
    public readonly onDidChangeSelected = this.onDidChangeSelectedEmitter.event;
    private migrationPromise?: Promise<void>;
    private configurationChangeListener?: vscode.Disposable;

    public constructor() {
        this.migrationPromise = this.migrateFromMementoToSettings();
        this.setSelectedClusterIfNeeded();
        
        // Listen for configuration changes to sync selected cluster
        this.configurationChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('kafka.clusters') || e.affectsConfiguration('kafka.clusters.selected')) {
                this.handleConfigurationChange();
            }
        });
    }

    get selected(): Cluster | undefined {
        const config = vscode.workspace.getConfiguration('kafka');
        const selectedClusterId = config.get<string>('clusters.selected');

        if (!selectedClusterId) {
            return undefined;
        }

        return this.get(selectedClusterId);
    }

    set selected(value: Cluster | undefined) {
        const oldClusterId = this.selected?.id;
        const config = vscode.workspace.getConfiguration('kafka');
        config.update('clusters.selected', value?.id, vscode.ConfigurationTarget.Workspace);
        this.onDidChangeSelectedEmitter.fire({ oldClusterId: oldClusterId, newClusterId: value?.id });
    }

    getAll(): Cluster[] {
        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        return clusters.sort(this.sortByNameAscending);
    }

    private sortByNameAscending(a: Cluster, b: Cluster): -1 | 0 | 1 {
        if (a.name && b.name) {
            if (a.name.toLowerCase() < b.name.toLowerCase()) { return -1; }
            if (a.name.toLowerCase() > b.name.toLowerCase()) { return 1; }
        }
        return 0;
    }

    get(id: string): Cluster | undefined {
        const clusters = this.getAll();
        return clusters.find(c => c.id === id);
    }

    async getWithCredentials(id: string): Promise<Cluster | undefined> {
        await this.migrationPromise;
        const cluster = this.get(id);
        
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
        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        const secretsStorage = SecretsStorage.getInstance();
        
        // Extract all secrets before storing in settings
        const password = cluster.saslOption?.password;
        const oauthClientSecret = cluster.saslOption?.oauthClientSecret;
        const awsSecretAccessKey = cluster.saslOption?.awsSecretAccessKey;
        const awsSessionToken = cluster.saslOption?.awsSessionToken;
        
        // Create cluster without secrets for settings storage
        const clusterWithoutSecrets: Cluster = {
            ...cluster,
            saslOption: cluster.saslOption ? {
                ...cluster.saslOption,
                password: undefined,
                oauthClientSecret: undefined,
                awsSecretAccessKey: undefined,
                awsSessionToken: undefined
            } : undefined
        };

        // Update or add cluster
        const existingIndex = clusters.findIndex(c => c.id === cluster.id);
        if (existingIndex >= 0) {
            clusters[existingIndex] = clusterWithoutSecrets;
        } else {
            clusters.push(clusterWithoutSecrets);
        }

        await config.update('clusters', clusters, vscode.ConfigurationTarget.Global);

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

        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        const filtered = clusters.filter(c => c.id !== id);
        
        await config.update('clusters', filtered, vscode.ConfigurationTarget.Global);
        
        // Delete all secrets from secure storage
        await SecretsStorage.getInstance().deleteAllSecrets(id);
        
        this.setSelectedClusterIfNeeded();
    }

    static getInstance(): SettingsClusterSettings {
        if (!SettingsClusterSettings.instance) {
            SettingsClusterSettings.instance = new SettingsClusterSettings();
        }

        return SettingsClusterSettings.instance;
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

    private handleConfigurationChange(): void {
        // Handle external configuration changes (e.g., settings sync, manual edits)
        const currentSelected = this.selected;
        const config = vscode.workspace.getConfiguration('kafka');
        const selectedClusterId = config.get<string>('clusters.selected');
        
        if (currentSelected?.id !== selectedClusterId) {
            this.onDidChangeSelectedEmitter.fire({
                oldClusterId: currentSelected?.id,
                newClusterId: selectedClusterId
            });
        }
    }

    /**
     * Migrates existing clusters from Memento (globalState) to settings.json.
     * This handles both:
     * 1. Migrating plain-text passwords from Memento to SecretStorage (if not done)
     * 2. Migrating cluster metadata from Memento to settings.json
     * 
     * This is a one-time migration that runs on extension activation.
     */
    private async migrateFromMementoToSettings(): Promise<void> {
        // Skip migration if Context is not initialized (e.g., in tests)
        if (!Context.current || !Context.current.globalState) {
            console.log('Skipping migration - Context not initialized');
            return;
        }
        
        const globalState = Context.current.globalState;
        const settingsMigrationKey = 'settingsMigrationCompleted';
        const secretsMigrationKey = 'secretsMigrationCompleted';
        
        // Check if settings migration is already done
        const settingsMigrationCompleted = globalState.get<boolean>(settingsMigrationKey, false);
        
        if (settingsMigrationCompleted) {
            return; // Migration already done
        }

        try {
            const clusterCollectionStorageKey = "clusters";
            const selectedClusterIdStorageKey = "selectedcluster";
            
            // Get clusters from memento
            const mementoState = globalState.get<ClusterStoreType>(clusterCollectionStorageKey, {});
            const clusters = Object.values(mementoState);
            
            if (clusters.length === 0) {
                // No clusters to migrate, just mark as complete
                await globalState.update(settingsMigrationKey, true);
                return;
            }

            // STEP 1: Migrate passwords to SecretStorage if not already done
            // This handles users upgrading directly from pre-0.18.0 versions
            const secretsMigrationCompleted = globalState.get<boolean>(secretsMigrationKey, false);
            if (!secretsMigrationCompleted) {
                await this.migratePasswordsToSecrets(mementoState);
                await globalState.update(secretsMigrationKey, true);
            }

            // STEP 2: Migrate cluster metadata to settings.json
            const config = vscode.workspace.getConfiguration('kafka');
            const existingClusters = config.get<Cluster[]>('clusters', []);
            
            // Only migrate if settings.json is empty
            if (existingClusters.length === 0) {
                // Get clusters from memento (passwords should now be in SecretStorage)
                const updatedMementoState = globalState.get<ClusterStoreType>(clusterCollectionStorageKey, {});
                const clustersToMigrate = Object.values(updatedMementoState);
                
                // Migrate clusters to settings.json
                await config.update('clusters', clustersToMigrate, vscode.ConfigurationTarget.Global);
                
                // Migrate selected cluster
                const selectedClusterId = globalState.get<string>(selectedClusterIdStorageKey);
                if (selectedClusterId) {
                    await config.update('clusters.selected', selectedClusterId, vscode.ConfigurationTarget.Workspace);
                }
                
                vscode.window.showInformationMessage(
                    `Kafka: Migrated ${clustersToMigrate.length} cluster(s) to VS Code settings.json. You can now edit clusters directly in settings or sync them across machines.`
                );
            }
            
            // Mark settings migration as completed
            await globalState.update(settingsMigrationKey, true);
        } catch (error) {
            console.error('Failed to migrate clusters from memento to settings:', error);
            // Don't throw - allow extension to continue functioning
        }
    }

    /**
     * Migrates existing plain-text passwords from Memento to SecretStorage.
     * This is called by migrateFromMementoToSettings() to handle users upgrading
     * directly from versions before 0.18.0.
     */
    private async migratePasswordsToSecrets(mementoState: ClusterStoreType): Promise<void> {
        const globalState = Context.current.globalState;
        const secretsStorage = SecretsStorage.getInstance();
        const clusterCollectionStorageKey = "clusters";
        
        try {
            let passwordsMigrated = false;
            
            // Migrate each cluster's password
            for (const cluster of Object.values(mementoState)) {
                if (cluster.saslOption?.password) {
                    // Store password in secure storage
                    await secretsStorage.storePassword(cluster.id, cluster.saslOption.password);
                    
                    // Remove password from memento storage
                    cluster.saslOption.password = undefined;
                    mementoState[cluster.id] = cluster;
                    passwordsMigrated = true;
                }
            }

            if (passwordsMigrated) {
                // Update memento storage without passwords
                await globalState.update(clusterCollectionStorageKey, mementoState);
                
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
                        'Kafka: Cluster passwords have been migrated to secure storage.'
                    );
                }
            }
        } catch (error) {
            console.error('Failed to migrate passwords to secure storage:', error);
            // Don't throw - allow extension to continue functioning
        }
    }

    dispose(): void {
        this.configurationChangeListener?.dispose();
        this.onDidChangeSelectedEmitter.dispose();
    }
}

export const getClusterSettings = (): ClusterSettings => SettingsClusterSettings.getInstance();
