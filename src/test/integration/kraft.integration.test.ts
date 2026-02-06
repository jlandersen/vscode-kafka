/**
 * Integration tests for Kafka clusters running in KRaft mode (without Zookeeper).
 * 
 * This tests the issue reported in https://github.com/jlandersen/vscode-kafka/issues/248
 * where consumers couldn't consume from KRaft-based clusters.
 * 
 * KRaft (Kafka Raft) is the new consensus protocol that replaces Zookeeper starting
 * from Kafka 3.3+. This test suite ensures the extension works correctly with
 * KRaft-based clusters for both producing and consuming messages.
 */

import * as assert from "assert";
import { Client } from "../../client/client";
import { KafkaProducer, KafkaConsumer } from "../../client/types";
import { createKRaftFixture, TestFixture } from "./kafkaContainers";
import { createTestClient } from "./testClient";

suite("KRaft Mode Integration Tests", function () {
    this.timeout(180000);

    suite("KRaft Cluster (No Zookeeper)", function () {
        let fixture: TestFixture;
        let client: Client;

        suiteSetup(async function () {
            console.log("Setting up KRaft Kafka container (without Zookeeper)...");
            fixture = await createKRaftFixture();
            
            client = createTestClient(fixture.connectionInfo, "test-kraft");
            await client.connect();
        });

        suiteTeardown(async function () {
            console.log("Tearing down KRaft Kafka container...");
            if (client) {
                client.dispose();
            }
            if (fixture) {
                await fixture.stop();
            }
        });

        test("should connect to KRaft cluster and retrieve brokers", async function () {
            const brokers = await client.getBrokers();
            
            assert.ok(brokers, "Brokers should be defined");
            assert.ok(brokers.length > 0, "Should have at least one broker");
            
            const broker = brokers[0];
            assert.ok(broker.id, "Broker should have an ID");
            assert.ok(broker.host, "Broker should have a host");
            assert.ok(broker.port, "Broker should have a port");
            assert.strictEqual(typeof broker.isController, "boolean", "Broker should have isController flag");
            
            console.log(`KRaft cluster: Found ${brokers.length} broker(s):`, brokers.map(b => `${b.id}@${b.host}:${b.port}`));
        });

        test("should create and list topics on KRaft cluster", async function () {
            const topicName = `kraft-test-topic-${Date.now()}`;
            
            await client.createTopic({
                topic: topicName,
                partitions: 3,
                replicationFactor: 1,
            });
            
            const topics = await client.getTopics();
            const createdTopic = topics.find(t => t.id === topicName);
            assert.ok(createdTopic, `Topic ${topicName} should exist after creation`);
            assert.strictEqual(createdTopic.partitionCount, 3, "Topic should have 3 partitions");
            
            console.log(`Created topic on KRaft cluster: ${topicName} with ${createdTopic.partitionCount} partitions`);
            
            await client.deleteTopic({ topics: [topicName] });
        });

        test("should produce messages to KRaft cluster", async function () {
            const topicName = `kraft-produce-test-${Date.now()}`;
            
            await client.createTopic({
                topic: topicName,
                partitions: 1,
                replicationFactor: 1,
            });
            
            console.log(`Created topic for produce test: ${topicName}`);
            
            const producer: KafkaProducer = await client.producer();
            
            const messages = [
                { key: "key1", value: "message-1" },
                { key: "key2", value: "message-2" },
                { key: "key3", value: "message-3" },
            ];
            
            await producer.send({
                topic: topicName,
                messages: messages.map(m => ({
                    key: Buffer.from(m.key),
                    value: Buffer.from(m.value),
                })),
            });
            
            console.log(`Produced ${messages.length} messages to ${topicName}`);
            
            await producer.disconnect();
            
            const offsets = await client.fetchTopicOffsets(topicName);
            assert.ok(offsets.length > 0, "Should have partition offsets");
            assert.strictEqual(offsets[0].high, "3", "High watermark should be 3 after sending 3 messages");
            
            console.log(`Verified offsets: high=${offsets[0].high}, low=${offsets[0].low}`);
            
            await client.deleteTopic({ topics: [topicName] });
        });

        test("should consume messages from KRaft cluster", async function () {
            const topicName = `kraft-consume-test-${Date.now()}`;
            const groupId = `kraft-consumer-group-${Date.now()}`;
            
            await client.createTopic({
                topic: topicName,
                partitions: 1,
                replicationFactor: 1,
            });
            
            console.log(`Created topic for consume test: ${topicName}`);
            
            const producer: KafkaProducer = await client.producer();
            const testMessages = [
                { key: "test-key-1", value: "test-message-1" },
                { key: "test-key-2", value: "test-message-2" },
                { key: "test-key-3", value: "test-message-3" },
                { key: "test-key-4", value: "test-message-4" },
                { key: "test-key-5", value: "test-message-5" },
            ];
            
            await producer.send({
                topic: topicName,
                messages: testMessages.map(m => ({
                    key: Buffer.from(m.key),
                    value: Buffer.from(m.value),
                })),
            });
            
            await producer.disconnect();
            console.log(`Produced ${testMessages.length} messages to ${topicName}`);
            
            const consumer: KafkaConsumer = await client.consumer({
                groupId,
                sessionTimeout: 30000,
                heartbeatInterval: 3000,
            });
            
            await consumer.subscribe({ topic: topicName, fromBeginning: true });
            
            const consumedMessages: Array<{ key: string; value: string }> = [];
            const consumePromise = new Promise<void>((resolve, reject) => {
                let timeoutId: NodeJS.Timeout;
                
                consumer.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        const key = message.key?.toString() || "";
                        const value = message.value?.toString() || "";
                        
                        consumedMessages.push({ key, value });
                        console.log(`Consumed message: key=${key}, value=${value}`);
                        
                        if (consumedMessages.length === testMessages.length) {
                            clearTimeout(timeoutId);
                            resolve();
                        }
                    },
                }).catch(reject);
                
                timeoutId = setTimeout(() => {
                    reject(new Error(`Timeout: Only consumed ${consumedMessages.length}/${testMessages.length} messages`));
                }, 30000);
            });
            
            await consumePromise;
            
            assert.strictEqual(
                consumedMessages.length, 
                testMessages.length, 
                `Should consume all ${testMessages.length} messages`
            );
            
            for (let i = 0; i < testMessages.length; i++) {
                assert.strictEqual(
                    consumedMessages[i].key,
                    testMessages[i].key,
                    `Message ${i} key should match`
                );
                assert.strictEqual(
                    consumedMessages[i].value,
                    testMessages[i].value,
                    `Message ${i} value should match`
                );
            }
            
            console.log(`✓ Successfully consumed and verified all ${consumedMessages.length} messages from KRaft cluster`);
            
            await consumer.disconnect();
            
            const groupIds = await client.getConsumerGroupIds();
            assert.ok(
                groupIds.includes(groupId),
                `Consumer group ${groupId} should exist`
            );
            
            const groupDetails = await client.getConsumerGroupDetails(groupId);
            assert.strictEqual(groupDetails.groupId, groupId, "Group ID should match");
            assert.ok(groupDetails.offsets.length > 0, "Should have committed offsets");
            
            console.log(`Consumer group state: ${groupDetails.state}`);
            console.log(`Consumer group offsets:`, groupDetails.offsets.map(o => 
                `${o.topic}[${o.partition}]: offset=${o.offset}`
            ));
            
            await client.deleteConsumerGroups([groupId]);
            await client.deleteTopic({ topics: [topicName] });
        });

        test("should handle multiple partitions on KRaft cluster", async function () {
            const topicName = `kraft-multipart-test-${Date.now()}`;
            const groupId = `kraft-multipart-consumer-${Date.now()}`;
            const partitionCount = 3;
            const messagesPerPartition = 5;
            const totalMessages = partitionCount * messagesPerPartition;
            
            await client.createTopic({
                topic: topicName,
                partitions: partitionCount,
                replicationFactor: 1,
            });
            
            console.log(`Created multi-partition topic: ${topicName} with ${partitionCount} partitions`);
            
            const producer: KafkaProducer = await client.producer();
            const messages = [];
            
            for (let i = 0; i < totalMessages; i++) {
                messages.push({
                    key: `key-${i}`,
                    value: `message-${i}`,
                    partition: i % partitionCount,
                });
            }
            
            await producer.send({
                topic: topicName,
                messages: messages.map(m => ({
                    key: Buffer.from(m.key),
                    value: Buffer.from(m.value),
                    partition: m.partition,
                })),
            });
            
            await producer.disconnect();
            console.log(`Produced ${messages.length} messages across ${partitionCount} partitions`);
            
            const consumer: KafkaConsumer = await client.consumer({
                groupId,
            });
            
            await consumer.subscribe({ topic: topicName, fromBeginning: true });
            
            const consumedMessages: Array<{ key: string; value: string; partition: number }> = [];
            const consumePromise = new Promise<void>((resolve, reject) => {
                let timeoutId: NodeJS.Timeout;
                
                consumer.run({
                    eachMessage: async ({ partition, message }) => {
                        const key = message.key?.toString() || "";
                        const value = message.value?.toString() || "";
                        
                        consumedMessages.push({ key, value, partition });
                        
                        if (consumedMessages.length === totalMessages) {
                            clearTimeout(timeoutId);
                            resolve();
                        }
                    },
                }).catch(reject);
                
                timeoutId = setTimeout(() => {
                    reject(new Error(`Timeout: Only consumed ${consumedMessages.length}/${totalMessages} messages`));
                }, 30000);
            });
            
            await consumePromise;
            
            const partitionsConsumed = new Set(consumedMessages.map(m => m.partition));
            assert.strictEqual(
                partitionsConsumed.size,
                partitionCount,
                `Should consume from all ${partitionCount} partitions`
            );
            
            assert.strictEqual(
                consumedMessages.length,
                totalMessages,
                `Should consume all ${totalMessages} messages`
            );
            
            console.log(`✓ Successfully consumed ${consumedMessages.length} messages from ${partitionsConsumed.size} partitions`);
            
            await consumer.disconnect();
            
            await client.deleteConsumerGroups([groupId]);
            await client.deleteTopic({ topics: [topicName] });
        });

        test("should retrieve broker configurations from KRaft cluster", async function () {
            const brokers = await client.getBrokers();
            assert.ok(brokers.length > 0, "Should have at least one broker");
            
            const brokerId = brokers[0].id;
            const configs = await client.getBrokerConfigs(brokerId);
            
            assert.ok(configs, "Broker configs should be defined");
            assert.ok(Array.isArray(configs), "Broker configs should be an array");
            assert.ok(configs.length > 0, "Should have broker configs");
            
            console.log(`Found ${configs.length} broker config(s) in KRaft cluster`);
            
            const configNames = configs.map(c => c.configName);
            const expectedConfigs = ["log.dirs", "num.partitions"];
            
            for (const expected of expectedConfigs) {
                if (configNames.includes(expected)) {
                    console.log(`  ✓ Found config: ${expected}`);
                }
            }
        });
    });
});
