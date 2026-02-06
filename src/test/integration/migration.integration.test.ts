/**
 * Integration tests for cluster migration from Memento to Settings.
 * 
 * These tests verify that the extension correctly migrates cluster configurations
 * from the old storage format (Memento/globalState) to the new format (settings.json + SecretStorage):
 * 1. Password migration from plain-text in Memento to SecretStorage
 * 2. Cluster metadata migration from Memento to settings.json
 * 3. Selected cluster migration to workspace settings
 * 
 * Note: For tests of the new storage format itself, see settings-storage.integration.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { Cluster } from "../../client/client";

suite("Cluster Migration from Memento to Settings Integration Tests", function () {
    this.timeout(30000);

    const testClusterId1 = "test-cluster-1";
    const testClusterId2 = "test-cluster-2";
    const testPassword1 = "password123";
    const testPassword2 = "secretPass456";

    let testGlobalState: Map<string, any>;
    let mockContext: vscode.ExtensionContext;

    suiteSetup(async function () {
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    setup(async function () {
        testGlobalState = new Map<string, any>();
        
        const globalState = {
            keys: () => Array.from(testGlobalState.keys()),
            get: <T>(key: string, defaultValue?: T) => testGlobalState.has(key) ? testGlobalState.get(key) : defaultValue,
            update: async (key: string, value: any) => {
                if (value === undefined) {
                    testGlobalState.delete(key);
                } else {
                    testGlobalState.set(key, value);
                }
            },
            setKeysForSync: (keys: readonly string[]) => { }
        } as vscode.Memento;

        mockContext = {
            globalState,
            workspaceState: globalState,
            secrets: undefined,
            subscriptions: [],
            extensionPath: '',
            storagePath: undefined,
            globalStoragePath: '',
            logPath: '',
            extensionUri: vscode.Uri.file(''),
            extensionMode: vscode.ExtensionMode.Test,
            asAbsolutePath: (relativePath: string) => relativePath,
            storageUri: undefined,
            globalStorageUri: vscode.Uri.file(''),
            logUri: vscode.Uri.file(''),
            extension: {} as vscode.Extension<any>,
            environmentVariableCollection: {} as any,
            languageModelAccessInformation: {} as any,
        } as unknown as vscode.ExtensionContext;

        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
        }
    });

    suiteTeardown(async function () {
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
        }
    });

    test("should migrate clusters from Memento to settings.json", async function () {
        const oldClusters = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Old Cluster 1",
                bootstrap: "localhost:9092",
                saslOption: {
                    mechanism: "plain",
                    username: "user1"
                }
            } as Cluster,
            [testClusterId2]: {
                id: testClusterId2,
                name: "Old Cluster 2",
                bootstrap: "localhost:9093",
                saslOption: {
                    mechanism: "scram-sha-256",
                    username: "user2"
                }
            } as Cluster
        };

        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        const secretsStorage = SecretsStorage.getInstance();
        await secretsStorage.storePassword(testClusterId1, testPassword1);
        await secretsStorage.storePassword(testClusterId2, testPassword2);

        await mockContext.globalState.update('clusters', oldClusters);
        await mockContext.globalState.update('selectedcluster', testClusterId1);

        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        
        const clusterSettings = getClusterSettings();
        
        await clusterSettings.getWithCredentials('any-id');

        const config = vscode.workspace.getConfiguration('kafka');
        const migratedClusters = config.get<Cluster[]>('clusters', []);
        
        assert.strictEqual(migratedClusters.length, 2, "Should have migrated 2 clusters");
        
        const cluster1 = migratedClusters.find(c => c.id === testClusterId1);
        const cluster2 = migratedClusters.find(c => c.id === testClusterId2);
        
        assert.ok(cluster1, "Cluster 1 should be migrated");
        assert.ok(cluster2, "Cluster 2 should be migrated");
        
        assert.strictEqual(cluster1.name, "Old Cluster 1");
        assert.strictEqual(cluster2.name, "Old Cluster 2");
        
        assert.strictEqual(cluster1.saslOption?.password, undefined, "Password should not be in settings");
        assert.strictEqual(cluster2.saslOption?.password, undefined, "Password should not be in settings");

        const password1 = await secretsStorage.getPassword(testClusterId1);
        const password2 = await secretsStorage.getPassword(testClusterId2);
        assert.strictEqual(password1, testPassword1, "Password 1 should still be in SecretStorage");
        assert.strictEqual(password2, testPassword2, "Password 2 should still be in SecretStorage");

        const migrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(migrationCompleted, true, "Migration flag should be set");
    });

    test("should migrate passwords from plain-text Memento to SecretStorage", async function () {
        const oldClustersWithPasswords = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Cluster with Password",
                bootstrap: "localhost:9092",
                saslOption: {
                    mechanism: "plain",
                    username: "user1",
                    password: testPassword1
                }
            } as Cluster
        };

        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        await mockContext.globalState.update('clusters', oldClustersWithPasswords);
        await mockContext.globalState.update('secretsMigrationCompleted', false);
        await mockContext.globalState.update('settingsMigrationCompleted', false);

        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        
        const clusterSettings = getClusterSettings();
        
        await clusterSettings.getWithCredentials('any-id');

        const secretsStorage = SecretsStorage.getInstance();
        const retrievedPassword = await secretsStorage.getPassword(testClusterId1);
        assert.strictEqual(retrievedPassword, testPassword1, "Password should be in SecretStorage");

        const updatedMemento = mockContext.globalState.get<any>('clusters', {});
        const clusterInMemento = updatedMemento[testClusterId1];
        assert.strictEqual(clusterInMemento?.saslOption?.password, undefined, 
            "Password should be removed from Memento");

        const config = vscode.workspace.getConfiguration('kafka');
        const migratedClusters = config.get<Cluster[]>('clusters', []);
        assert.strictEqual(migratedClusters.length, 1, "Should have migrated 1 cluster");
        assert.strictEqual(migratedClusters[0].saslOption?.password, undefined,
            "Password should not be in settings.json");

        const secretsMigrationCompleted = mockContext.globalState.get<boolean>('secretsMigrationCompleted');
        const settingsMigrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(secretsMigrationCompleted, true, "Secrets migration flag should be set");
        assert.strictEqual(settingsMigrationCompleted, true, "Settings migration flag should be set");
    });

    test("should not re-migrate if already completed", async function () {
        const oldClusters = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Already Migrated Cluster",
                bootstrap: "localhost:9092"
            } as Cluster
        };

        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        await mockContext.globalState.update('settingsMigrationCompleted', true);
        await mockContext.globalState.update('clusters', oldClusters);

        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [{
            id: "existing-cluster",
            name: "Existing Cluster",
            bootstrap: "localhost:9094"
        }], vscode.ConfigurationTarget.Global);

        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();
        
        await clusterSettings.getWithCredentials('any-id');

        const freshConfig = vscode.workspace.getConfiguration('kafka');
        const clusters = freshConfig.get<Cluster[]>('clusters', []);
        assert.strictEqual(clusters.length, 1, "Should still have 1 cluster");
        assert.strictEqual(clusters[0].id, "existing-cluster", 
            "Should not overwrite existing settings");
    });

    test("should handle empty Memento gracefully", async function () {
        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        await mockContext.globalState.update('clusters', {});

        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();
        
        await clusterSettings.getWithCredentials('any-id');

        const migrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(migrationCompleted, true, "Migration should complete even with no clusters");

        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        assert.strictEqual(clusters.length, 0, "Should have no clusters");
    });
});
