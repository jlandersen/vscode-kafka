/**
 * Integration tests for settings-based cluster storage.
 * 
 * These tests verify that the extension correctly stores and retrieves cluster
 * configurations using settings.json and SecretStorage:
 * 1. Cluster metadata stored in settings.json (machine scope)
 * 2. Sensitive credentials stored in SecretStorage
 * 3. OAuth and AWS credentials properly handled
 * 
 * Note: For actual migration tests (Memento → Settings), see migration.integration.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { Cluster } from "../../client/client";
import { initializeTestEnvironment } from "./testSetup";

suite("Settings-Based Cluster Storage Integration Tests", function () {
    // Increase timeout for VS Code extension operations
    this.timeout(30000);

    const testClusterId = "test-migration-cluster";
    const testPassword = "test-password-123";

    suiteSetup(async function () {
        // Increase timeout for extension activation
        this.timeout(30000);
        
        // Activate the extension
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        if (extension && !extension.isActive) {
            await extension.activate();
        }
        
        // Initialize test environment (Context and SecretsStorage)
        await initializeTestEnvironment();
    });

    suiteTeardown(async function () {
        // Clean up test data
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        // Skip workspace settings cleanup if no workspace is open
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
            // Workspace settings not available in test environment
        }
    });

    test("cluster settings should be accessible", async function () {
        // Basic smoke test to ensure cluster settings can be loaded
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();
        
        assert.ok(clusterSettings, "Cluster settings should be defined");
        assert.ok(typeof clusterSettings.getAll === 'function', "Should have getAll method");
        assert.ok(typeof clusterSettings.upsert === 'function', "Should have upsert method");
    });

    test("should store and retrieve clusters in settings.json", async function () {
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();

        const testCluster: Cluster = {
            id: testClusterId,
            name: "Test Migration Cluster",
            bootstrap: "localhost:9092",
            saslOption: {
                mechanism: "plain",
                username: "testuser",
                password: testPassword
            }
        };

        // Store cluster
        await clusterSettings.upsert(testCluster);

        // Verify cluster is in settings.json
        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        
        assert.ok(clusters.length > 0, "Should have at least one cluster in settings");
        
        const storedCluster = clusters.find(c => c.id === testClusterId);
        assert.ok(storedCluster, "Test cluster should be in settings.json");
        assert.strictEqual(storedCluster.name, testCluster.name);
        assert.strictEqual(storedCluster.bootstrap, testCluster.bootstrap);
        
        // Verify password is NOT in settings.json
        assert.strictEqual(storedCluster.saslOption?.password, undefined,
            "Password should not be stored in settings.json");
    });

    test("should retrieve cluster with credentials from SecretStorage", async function () {
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();

        const testCluster: Cluster = {
            id: testClusterId + "-secrets",
            name: "Test Secrets Cluster",
            bootstrap: "localhost:9092",
            saslOption: {
                mechanism: "plain",
                username: "testuser",
                password: testPassword
            }
        };

        // Store cluster (password goes to SecretStorage)
        await clusterSettings.upsert(testCluster);

        // Get cluster without credentials
        const clusterWithoutCreds = clusterSettings.get(testCluster.id);
        assert.ok(clusterWithoutCreds, "Should get cluster");
        assert.strictEqual(clusterWithoutCreds?.saslOption?.password, undefined,
            "get() should not include password");

        // Get cluster with credentials
        const clusterWithCreds = await clusterSettings.getWithCredentials(testCluster.id);
        assert.ok(clusterWithCreds, "Should get cluster with credentials");
        assert.strictEqual(clusterWithCreds?.saslOption?.password, testPassword,
            "getWithCredentials() should load password from SecretStorage");
    });

    test("should handle OAUTHBEARER secret storage", async function () {
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();

        const oauthSecret = "oauth-client-secret-123";
        const testCluster: Cluster = {
            id: testClusterId + "-oauth",
            name: "Test OAuth Cluster",
            bootstrap: "localhost:9092",
            saslOption: {
                mechanism: "oauthbearer",
                oauthTokenEndpoint: "https://auth.example.com/token",
                oauthClientId: "my-client-id",
                oauthClientSecret: oauthSecret
            }
        };

        // Store cluster
        await clusterSettings.upsert(testCluster);

        // Verify secret is not in settings.json
        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        const storedCluster = clusters.find(c => c.id === testCluster.id);
        
        assert.strictEqual(storedCluster?.saslOption?.oauthClientSecret, undefined,
            "OAuth client secret should not be in settings.json");

        // Verify secret can be retrieved
        const clusterWithCreds = await clusterSettings.getWithCredentials(testCluster.id);
        assert.strictEqual(clusterWithCreds?.saslOption?.oauthClientSecret, oauthSecret,
            "OAuth client secret should be loaded from SecretStorage");
    });

    test("should handle AWS MSK IAM secret storage", async function () {
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();

        const awsSecretKey = "aws-secret-key-123";
        const awsSessionToken = "aws-session-token-456";
        
        const testCluster: Cluster = {
            id: testClusterId + "-aws",
            name: "Test AWS MSK Cluster",
            bootstrap: "b-1.mycluster.kafka.us-east-1.amazonaws.com:9098",
            saslOption: {
                mechanism: "aws",
                awsRegion: "us-east-1",
                awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
                awsSecretAccessKey: awsSecretKey,
                awsSessionToken: awsSessionToken
            }
        };

        // Store cluster
        await clusterSettings.upsert(testCluster);

        // Verify secrets are not in settings.json
        const config = vscode.workspace.getConfiguration('kafka');
        const clusters = config.get<Cluster[]>('clusters', []);
        const storedCluster = clusters.find(c => c.id === testCluster.id);
        
        assert.strictEqual(storedCluster?.saslOption?.awsSecretAccessKey, undefined,
            "AWS secret access key should not be in settings.json");
        assert.strictEqual(storedCluster?.saslOption?.awsSessionToken, undefined,
            "AWS session token should not be in settings.json");

        // Verify non-secrets are in settings.json
        assert.strictEqual(storedCluster?.saslOption?.awsAccessKeyId, "AKIAIOSFODNN7EXAMPLE",
            "AWS access key ID (non-secret) should be in settings.json");
        assert.strictEqual(storedCluster?.saslOption?.awsRegion, "us-east-1",
            "AWS region should be in settings.json");

        // Verify secrets can be retrieved
        const clusterWithCreds = await clusterSettings.getWithCredentials(testCluster.id);
        assert.strictEqual(clusterWithCreds?.saslOption?.awsSecretAccessKey, awsSecretKey,
            "AWS secret key should be loaded from SecretStorage");
        assert.strictEqual(clusterWithCreds?.saslOption?.awsSessionToken, awsSessionToken,
            "AWS session token should be loaded from SecretStorage");
    });

    test("selected cluster should use workspace scope", async function () {
        this.skip(); // Skip this test - requires an open workspace
        
        const { getClusterSettings } = await import('../../settings/clusters');
        const clusterSettings = getClusterSettings();

        const testCluster: Cluster = {
            id: testClusterId + "-workspace",
            name: "Workspace Scoped Cluster",
            bootstrap: "localhost:9092"
        };

        await clusterSettings.upsert(testCluster);
        clusterSettings.selected = testCluster;

        // Verify selected cluster is in workspace settings
        const config = vscode.workspace.getConfiguration('kafka');
        const selectedId = config.get<string>('clusters.selected');
        
        assert.strictEqual(selectedId, testCluster.id,
            "Selected cluster should be stored in workspace settings");
    });
});
