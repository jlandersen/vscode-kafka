/**
 * Integration tests for Kafka broker operations.
 * 
 * These tests verify that the extension can connect to real Kafka clusters
 * and perform broker-related operations like listing brokers and retrieving
 * broker configurations.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { Client } from "../../client/client";
import { createPlaintextFixture, TestFixture } from "./kafkaContainers";
import { createTestClient } from "./testClient";

suite("Broker Integration Tests", function () {
    this.timeout(180000);

    suite("Plaintext Connection", function () {
        let fixture: TestFixture;
        let client: Client;

        suiteSetup(async function () {
            console.log("Setting up plaintext Kafka container...");
            fixture = await createPlaintextFixture();
            
            client = createTestClient(fixture.connectionInfo, "test-plaintext");
            await client.connect();
        });

        suiteTeardown(async function () {
            console.log("Tearing down plaintext Kafka container...");
            if (client) {
                client.dispose();
            }
            if (fixture) {
                await fixture.stop();
            }
        });

        test("should connect and retrieve brokers", async function () {
            const brokers = await client.getBrokers();
            
            assert.ok(brokers, "Brokers should be defined");
            assert.ok(brokers.length > 0, "Should have at least one broker");
            
            const broker = brokers[0];
            assert.ok(broker.id, "Broker should have an ID");
            assert.ok(broker.host, "Broker should have a host");
            assert.ok(broker.port, "Broker should have a port");
            assert.strictEqual(typeof broker.isController, "boolean", "Broker should have isController flag");
            
            console.log(`Found ${brokers.length} broker(s):`, brokers.map(b => `${b.id}@${b.host}:${b.port}`));
        });

        test("should retrieve broker configurations", async function () {
            const brokers = await client.getBrokers();
            assert.ok(brokers.length > 0, "Should have at least one broker");
            
            const brokerId = brokers[0].id;
            const configs = await client.getBrokerConfigs(brokerId);
            
            assert.ok(configs, "Broker configs should be defined");
            assert.ok(Array.isArray(configs), "Broker configs should be an array");
            
            const configNames = configs.map(c => c.configName);
            console.log(`Found ${configs.length} broker config(s)`);
            
            const expectedConfigs = ["log.dirs", "num.partitions", "default.replication.factor"];
            for (const expected of expectedConfigs) {
                if (configNames.includes(expected)) {
                    console.log(`  ✓ Found config: ${expected}`);
                }
            }
        });

        test("should list topics (may be empty on fresh cluster)", async function () {
            const topics = await client.getTopics();
            
            assert.ok(topics, "Topics should be defined");
            assert.ok(Array.isArray(topics), "Topics should be an array");
            
            console.log(`Found ${topics.length} topic(s)`);
        });

        test("should create and delete a topic", async function () {
            const topicName = `test-topic-${Date.now()}`;
            
            await client.createTopic({
                topic: topicName,
                partitions: 1,
                replicationFactor: 1,
            });
            
            const topics = await client.getTopics();
            const createdTopic = topics.find(t => t.id === topicName);
            assert.ok(createdTopic, `Topic ${topicName} should exist after creation`);
            assert.strictEqual(createdTopic.partitionCount, 1, "Topic should have 1 partition");
            
            console.log(`Created topic: ${topicName}`);
            
            await client.deleteTopic({ topics: [topicName] });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            const topicsAfterDelete = await client.getTopics();
            const deletedTopic = topicsAfterDelete.find(t => t.id === topicName);
            assert.ok(!deletedTopic, `Topic ${topicName} should not exist after deletion`);
            
            console.log(`Deleted topic: ${topicName}`);
        });
    });
});

suite("VS Code Extension Commands Integration Tests", function () {
    this.timeout(180000);

    let fixture: TestFixture;

    suiteSetup(async function () {
        console.log("Setting up Kafka container for command tests...");
        fixture = await createPlaintextFixture();
    });

    suiteTeardown(async function () {
        console.log("Tearing down Kafka container for command tests...");
        if (fixture) {
            await fixture.stop();
        }
    });

    test("extension should be active", async function () {
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        assert.ok(extension, "Extension should be present");
        
        if (!extension.isActive) {
            await extension.activate();
        }
        
        assert.ok(extension.isActive, "Extension should be active");
        console.log("Extension is active");
    });

    test("should be able to execute cluster-related commands", async function () {
        const commands = await vscode.commands.getCommands(true);
        
        const kafkaCommands = commands.filter(c => c.startsWith("vscode-kafka"));
        console.log(`Found ${kafkaCommands.length} vscode-kafka commands`);
        
        const essentialCommands = [
            "vscode-kafka.explorer.refresh",
        ];
        
        for (const cmd of essentialCommands) {
            assert.ok(
                kafkaCommands.includes(cmd), 
                `Essential command ${cmd} should exist`
            );
            console.log(`  ✓ Found command: ${cmd}`);
        }
    });

});
