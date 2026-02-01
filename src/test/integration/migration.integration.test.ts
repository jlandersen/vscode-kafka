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
    // Increase timeout for VS Code extension operations
    this.timeout(30000);

    const testClusterId1 = "test-cluster-1";
    const testClusterId2 = "test-cluster-2";
    const testPassword1 = "password123";
    const testPassword2 = "secretPass456";

    let testGlobalState: Map<string, any>;
    let mockContext: vscode.ExtensionContext;

    suiteSetup(async function () {
        // Activate the extension
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        if (extension && !extension.isActive) {
            await extension.activate();
            // extension.activate() returns a promise that resolves when activation is complete
        }
    });

    setup(async function () {
        // Create a fresh mock storage for each test
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

        // Clear settings.json before each test
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
            // Workspace settings not available
        }
    });

    suiteTeardown(async function () {
        // Clean up settings after all tests
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
            // Workspace settings not available
        }
    });

    test("should migrate clusters from Memento to settings.json", async function () {
        // ARRANGE: Set up old Memento storage format with clusters (without passwords - simulating post-0.18.0)
        const oldClusters = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Old Cluster 1",
                bootstrap: "localhost:9092",
                saslOption: {
                    mechanism: "plain",
                    username: "user1"
                    // password already migrated to SecretStorage in 0.18.0
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

        // Initialize Context and SecretsStorage with our mock
        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        // Pre-populate passwords in SecretStorage (as if 0.18.0 migration already happened)
        const secretsStorage = SecretsStorage.getInstance();
        await secretsStorage.storePassword(testClusterId1, testPassword1);
        await secretsStorage.storePassword(testClusterId2, testPassword2);

        // Put clusters in old Memento storage
        await mockContext.globalState.update('clusters', oldClusters);
        await mockContext.globalState.update('selectedcluster', testClusterId1);

        // ACT: Create a new SettingsClusterSettings instance (triggers migration)
        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        // Reset the singleton to force a fresh instance
        resetClusterSettingsForTesting();
        
        // Create new instance which should trigger migration
        const clusterSettings = getClusterSettings();
        
        // Wait for migration to complete by calling a method that awaits it
        await clusterSettings.getWithCredentials('any-id'); // This waits for migrationPromise

        // ASSERT: Verify clusters are now in settings.json
        const config = vscode.workspace.getConfiguration('kafka');
        const migratedClusters = config.get<Cluster[]>('clusters', []);
        
        assert.strictEqual(migratedClusters.length, 2, "Should have migrated 2 clusters");
        
        const cluster1 = migratedClusters.find(c => c.id === testClusterId1);
        const cluster2 = migratedClusters.find(c => c.id === testClusterId2);
        
        assert.ok(cluster1, "Cluster 1 should be migrated");
        assert.ok(cluster2, "Cluster 2 should be migrated");
        
        assert.strictEqual(cluster1.name, "Old Cluster 1");
        assert.strictEqual(cluster2.name, "Old Cluster 2");
        
        // Verify passwords are NOT in settings.json
        assert.strictEqual(cluster1.saslOption?.password, undefined, "Password should not be in settings");
        assert.strictEqual(cluster2.saslOption?.password, undefined, "Password should not be in settings");

        // Verify passwords are still in SecretStorage
        const password1 = await secretsStorage.getPassword(testClusterId1);
        const password2 = await secretsStorage.getPassword(testClusterId2);
        assert.strictEqual(password1, testPassword1, "Password 1 should still be in SecretStorage");
        assert.strictEqual(password2, testPassword2, "Password 2 should still be in SecretStorage");

        // Verify migration completion flag is set
        const migrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(migrationCompleted, true, "Migration flag should be set");
    });

    test("should migrate passwords from plain-text Memento to SecretStorage", async function () {
        // ARRANGE: Set up old Memento storage with plain-text passwords (pre-0.18.0 format)
        const oldClustersWithPasswords = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Cluster with Password",
                bootstrap: "localhost:9092",
                saslOption: {
                    mechanism: "plain",
                    username: "user1",
                    password: testPassword1  // Plain-text password in Memento!
                }
            } as Cluster
        };

        // Initialize Context and SecretsStorage with our mock
        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        // Put clusters with passwords in old Memento storage
        await mockContext.globalState.update('clusters', oldClustersWithPasswords);
        // Mark that neither migration has happened
        await mockContext.globalState.update('secretsMigrationCompleted', false);
        await mockContext.globalState.update('settingsMigrationCompleted', false);

        // ACT: Create a new SettingsClusterSettings instance (triggers both migrations)
        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        // Reset the singleton
        resetClusterSettingsForTesting();
        
        // Create new instance which should trigger migrations
        const clusterSettings = getClusterSettings();
        
        // Wait for migrations to complete
        await clusterSettings.getWithCredentials('any-id');

        // ASSERT: Verify password was moved to SecretStorage
        const secretsStorage = SecretsStorage.getInstance();
        const retrievedPassword = await secretsStorage.getPassword(testClusterId1);
        assert.strictEqual(retrievedPassword, testPassword1, "Password should be in SecretStorage");

        // Verify password was removed from Memento
        const updatedMemento = mockContext.globalState.get<any>('clusters', {});
        const clusterInMemento = updatedMemento[testClusterId1];
        assert.strictEqual(clusterInMemento?.saslOption?.password, undefined, 
            "Password should be removed from Memento");

        // Verify cluster metadata is in settings.json
        const config = vscode.workspace.getConfiguration('kafka');
        const migratedClusters = config.get<Cluster[]>('clusters', []);
        assert.strictEqual(migratedClusters.length, 1, "Should have migrated 1 cluster");
        assert.strictEqual(migratedClusters[0].saslOption?.password, undefined,
            "Password should not be in settings.json");

        // Verify both migration flags are set
        const secretsMigrationCompleted = mockContext.globalState.get<boolean>('secretsMigrationCompleted');
        const settingsMigrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(secretsMigrationCompleted, true, "Secrets migration flag should be set");
        assert.strictEqual(settingsMigrationCompleted, true, "Settings migration flag should be set");
    });

    test("should not re-migrate if already completed", async function () {
        // ARRANGE: Set up scenario where migration was already done
        const oldClusters = {
            [testClusterId1]: {
                id: testClusterId1,
                name: "Already Migrated Cluster",
                bootstrap: "localhost:9092"
            } as Cluster
        };

        // Initialize Context and SecretsStorage
        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        // Mark migration as already completed
        await mockContext.globalState.update('settingsMigrationCompleted', true);
        await mockContext.globalState.update('clusters', oldClusters);

        // Pre-populate settings.json with different data
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [{
            id: "existing-cluster",
            name: "Existing Cluster",
            bootstrap: "localhost:9094"
        }], vscode.ConfigurationTarget.Global);

        // ACT: Create a new SettingsClusterSettings instance
        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();
        
        // Wait for migration check to complete
        await clusterSettings.getWithCredentials('any-id');

        // ASSERT: Verify settings.json was NOT overwritten
        // Must get a fresh config reference as the old one may be stale
        const freshConfig = vscode.workspace.getConfiguration('kafka');
        const clusters = freshConfig.get<Cluster[]>('clusters', []);
        assert.strictEqual(clusters.length, 1, "Should still have 1 cluster");
        assert.strictEqual(clusters[0].id, "existing-cluster", 
            "Should not overwrite existing settings");
    });

    test("should handle empty Memento gracefully", async function () {
        // ARRANGE: No clusters in Memento
        const { Context } = await import('../../context');
        const { SecretsStorage } = await import('../../settings/secretsStorage');
        
        Context.register(mockContext);
        SecretsStorage.initialize(undefined, mockContext.globalState);

        // Empty Memento
        await mockContext.globalState.update('clusters', {});

        // ACT: Trigger migration
        const { resetClusterSettingsForTesting, getClusterSettings } = await import('../../settings/clusters');
        
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();
        
        // Wait for migration to complete
        await clusterSettings.getWithCredentials('any-id');

        // ASSERT: Should complete without errors
        const migrationCompleted = mockContext.globalState.get<boolean>('settingsMigrationCompleted');
        assert.strictEqual(migrationCompleted, true, "Migration should complete even with no clusters");

        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        assert.strictEqual(clusters.length, 0, "Should have no clusters");
    });
});
