/**
 * Integration tests for Snappy compression codec.
 * 
 * Tests that messages can be produced and consumed using Snappy
 * compression. This verifies the fix for:
 * https://github.com/jlandersen/vscode-kafka/issues/217
 */

import * as assert from "assert";
import { CompressionTypes, Producer, Consumer } from "kafkajs";
import { createPlaintextFixture, TestFixture } from "./kafkaContainers";
import { createTestClient, TestKafkaClient } from "./testClient";

suite("Compression Integration Tests", function () {
    this.timeout(180000);

    let fixture: TestFixture;
    let client: TestKafkaClient;

    suiteSetup(async function () {
        console.log("Setting up Kafka container for compression tests...");
        fixture = await createPlaintextFixture();
        client = createTestClient(fixture.connectionInfo, "test-compression");
        await client.connect();
    });

    suiteTeardown(async function () {
        console.log("Tearing down Kafka container...");
        if (client) {
            client.dispose();
        }
        if (fixture) {
            await fixture.stop();
        }
    });

    test("should produce and consume Snappy-compressed messages", async function () {
        const topicName = `compression-snappy-test-${Date.now()}`;
        const groupId = `compression-consumer-snappy-${Date.now()}`;

        await client.createTopic({
            topic: topicName,
            partitions: 1,
            replicationFactor: 1,
        });

        console.log(`Created topic for Snappy compression test: ${topicName}`);

        const producer: Producer = await client.producer();

        const testMessages = [
            { key: "snappy-key-1", value: "Snappy compressed message 1" },
            { key: "snappy-key-2", value: "Snappy compressed message 2" },
            { key: "snappy-key-3", value: "Snappy compressed message 3" },
        ];

        await producer.send({
            topic: topicName,
            compression: CompressionTypes.Snappy,
            messages: testMessages.map(m => ({
                key: Buffer.from(m.key),
                value: Buffer.from(m.value),
            })),
        });

        console.log(`Produced ${testMessages.length} Snappy-compressed messages to ${topicName}`);

        await producer.disconnect();

        const consumer: Consumer = await client.consumer({
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
                    console.log(`Consumed Snappy message: key=${key}, value=${value}`);

                    if (consumedMessages.length === testMessages.length) {
                        clearTimeout(timeoutId);
                        resolve();
                    }
                },
            }).catch(reject);

            timeoutId = setTimeout(() => {
                reject(new Error(`Timeout: Only consumed ${consumedMessages.length}/${testMessages.length} Snappy messages`));
            }, 30000);
        });

        await consumePromise;

        assert.strictEqual(
            consumedMessages.length,
            testMessages.length,
            `Should consume all ${testMessages.length} Snappy-compressed messages`
        );

        for (let i = 0; i < testMessages.length; i++) {
            assert.strictEqual(consumedMessages[i].key, testMessages[i].key, `Snappy message ${i} key should match`);
            assert.strictEqual(consumedMessages[i].value, testMessages[i].value, `Snappy message ${i} value should match`);
        }

        console.log(`Successfully verified Snappy compression: produced and consumed ${consumedMessages.length} messages`);

        await consumer.disconnect();
        await client.deleteConsumerGroups([groupId]);
        await client.deleteTopic({ topics: [topicName] });
    });
});
