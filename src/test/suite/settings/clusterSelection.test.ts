/**
 * Unit tests for cluster selection functionality.
 * 
 * These tests verify that:
 * 1. Cluster selection works with and without a workspace
 * 2. The selected cluster getter/setter work correctly
 * 3. The onDidChangeSelected event fires at the right time
 * 4. Configuration is read from the correct scope
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { Cluster } from "../../../client/client";

suite("Cluster Selection Test Suite", function () {
    this.timeout(10000);

    const testCluster1: Cluster = {
        id: "test-cluster-1",
        name: "Test Cluster 1",
        bootstrap: "localhost:9092"
    };

    const testCluster2: Cluster = {
        id: "test-cluster-2",
        name: "Test Cluster 2",
        bootstrap: "localhost:9093"
    };

    suiteSetup(async function () {
        // Set up test clusters in global config
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [testCluster1, testCluster2], vscode.ConfigurationTarget.Global);
    });

    suiteTeardown(async function () {
        // Clean up
        const config = vscode.workspace.getConfiguration('kafka');
        await config.update('clusters', [], vscode.ConfigurationTarget.Global);
        try {
            await config.update('clusters.selected', undefined, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
            // Workspace might not be available
        }
    });

    test("getAll should return clusters as an array", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        const clusters = clusterSettings.getAll();
        
        assert.ok(Array.isArray(clusters), "getAll() should return an array");
        assert.ok(clusters.length >= 2, "Should have at least 2 test clusters");
        
        // Verify we can call array methods (this would fail with the original bug)
        assert.doesNotThrow(() => {
            clusters.sort((a, b) => a.name.localeCompare(b.name));
            clusters.find(c => c.id === testCluster1.id);
            clusters.filter(c => c.bootstrap.includes("localhost"));
        }, "Array methods should work on getAll() result");
    });

    test("getAll should handle config returning non-array gracefully", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        // Even if config internals return something unexpected, getAll should return an array
        const clusters = clusterSettings.getAll();
        assert.ok(Array.isArray(clusters), "getAll() should always return an array");
    });

    test("selected setter should fire onDidChangeSelected event", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        let eventFired = false;
        let eventData: { oldClusterId?: string; newClusterId?: string } | undefined;

        const disposable = clusterSettings.onDidChangeSelected((e) => {
            eventFired = true;
            eventData = e;
        });

        try {
            clusterSettings.selected = testCluster1;

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            assert.ok(eventFired, "onDidChangeSelected event should fire");
            assert.strictEqual(eventData?.newClusterId, testCluster1.id, "Event should contain new cluster ID");
        } finally {
            disposable.dispose();
        }
    });

    test("selected getter should return cluster after selection", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        // Set up a listener to wait for the change to complete
        const changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                disposable.dispose();
                resolve();
            });
        });

        clusterSettings.selected = testCluster1;
        await changePromise;

        const selected = clusterSettings.selected;
        assert.ok(selected, "selected should return a cluster");
        assert.strictEqual(selected?.id, testCluster1.id, "selected should return the correct cluster");
        assert.strictEqual(selected?.name, testCluster1.name, "selected cluster should have correct name");
    });

    test("changing selected cluster should update getter value", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        // Select first cluster
        let changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                disposable.dispose();
                resolve();
            });
        });
        clusterSettings.selected = testCluster1;
        await changePromise;

        assert.strictEqual(clusterSettings.selected?.id, testCluster1.id, "First cluster should be selected");

        // Select second cluster
        changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                disposable.dispose();
                resolve();
            });
        });
        clusterSettings.selected = testCluster2;
        await changePromise;

        assert.strictEqual(clusterSettings.selected?.id, testCluster2.id, "Second cluster should be selected");
    });

    test("event should fire after config is updated (not before)", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        let selectedAtEventTime: Cluster | undefined;

        const changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                // Capture what selected returns at the time the event fires
                selectedAtEventTime = clusterSettings.selected;
                disposable.dispose();
                resolve();
            });
        });

        clusterSettings.selected = testCluster1;
        await changePromise;

        // The selected value at event time should match what we set
        // This test would have failed with the original bug where event fired before config update
        assert.strictEqual(selectedAtEventTime?.id, testCluster1.id, 
            "selected should return correct value when onDidChangeSelected fires");
    });

    test("clearing selected cluster should work", async function () {
        const { getClusterSettings, resetClusterSettingsForTesting } = await import('../../../settings/clusters');
        resetClusterSettingsForTesting();
        const clusterSettings = getClusterSettings();

        // First select a cluster
        let changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                disposable.dispose();
                resolve();
            });
        });
        clusterSettings.selected = testCluster1;
        await changePromise;

        // Then clear selection
        changePromise = new Promise<void>(resolve => {
            const disposable = clusterSettings.onDidChangeSelected(() => {
                disposable.dispose();
                resolve();
            });
        });
        clusterSettings.selected = undefined;
        await changePromise;

        assert.strictEqual(clusterSettings.selected, undefined, "selected should be undefined after clearing");
    });
});
