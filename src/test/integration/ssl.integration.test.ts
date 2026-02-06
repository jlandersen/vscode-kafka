/**
 * Integration tests for Kafka clusters with SSL/TLS encryption.
 * 
 * This tests the baseline user flows with SSL:
 * - Connect
 * - Retrieve brokers
 * - List topics
 * - Produce
 * - Consume
 * 
 * Note: The @testcontainers/kafka library only supports SASL_SSL listeners,
 * so this test uses SCRAM-SHA-256 authentication over SSL.
 */

import * as assert from "assert";
import { Client } from "../../client/client";
import { KafkaProducer, KafkaConsumer } from "../../client/types";
import { createSslFixture, TestFixture } from "./kafkaContainers";
import { createTestClient } from "./testClient";

suite("SSL Integration Tests", function () {
    this.timeout(180000);

    suite("SSL Cluster (SASL_SSL)", function () {
        let fixture: TestFixture;
        let client: Client;

        suiteSetup(async function () {
            console.log("Setting up SSL Kafka container...");
            fixture = await createSslFixture();
            
            client = createTestClient(fixture.connectionInfo, "test-ssl");
            await client.connect();
        });

        suiteTeardown(async function () {
            console.log("Tearing down SSL Kafka container...");
            if (client) {
                client.dispose();
            }
            if (fixture) {
                await fixture.stop();
            }
        });

        test("should connect to SSL cluster and retrieve brokers", async function () {
            const brokers = await client.getBrokers();
            
            assert.ok(brokers, "Brokers should be defined");
            assert.ok(brokers.length > 0, "Should have at least one broker");
            
            const broker = brokers[0];
            assert.ok(broker.id, "Broker should have an ID");
            assert.ok(broker.host, "Broker should have a host");
            assert.ok(broker.port, "Broker should have a port");
            assert.strictEqual(typeof broker.isController, "boolean", "Broker should have isController flag");
            
            console.log(`SSL cluster: Found ${brokers.length} broker(s):`, brokers.map(b => `${b.id}@${b.host}:${b.port}`));
        });

        test("should list topics on SSL cluster", async function () {
            const topics = await client.getTopics();
            
            assert.ok(topics, "Topics should be defined");
            assert.ok(Array.isArray(topics), "Topics should be an array");
            
            console.log(`SSL cluster: Found ${topics.length} topic(s)`);
        });

        test("should produce messages to SSL cluster", async function () {
            const topicName = `ssl-produce-test-${Date.now()}`;
            
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

        test("should consume messages from SSL cluster", async function () {
            const topicName = `ssl-consume-test-${Date.now()}`;
            const groupId = `ssl-consumer-group-${Date.now()}`;
            
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
                    eachMessage: async ({ message }) => {
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
                assert.strictEqual(consumedMessages[i].key, testMessages[i].key, `Message ${i} key should match`);
                assert.strictEqual(consumedMessages[i].value, testMessages[i].value, `Message ${i} value should match`);
            }
            
            console.log(`Successfully consumed and verified all ${consumedMessages.length} messages from SSL cluster`);
            
            await consumer.disconnect();
            
            await client.deleteConsumerGroups([groupId]);
            await client.deleteTopic({ topics: [topicName] });
        });
    });
});
