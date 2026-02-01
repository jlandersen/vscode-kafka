/**
 * Kafka container helpers for integration tests.
 * 
 * This module provides utilities to start Kafka containers with different
 * authentication configurations using testcontainers.
 */

import { KafkaContainer, StartedKafkaContainer } from "@testcontainers/kafka";

/**
 * Connection info returned after starting a Kafka container.
 */
export interface KafkaConnectionInfo {
    bootstrap: string;
    saslOption?: {
        mechanism: "plain" | "scram-sha-256" | "scram-sha-512";
        username: string;
        password: string;
    };
}

/**
 * Manages a Kafka container for plaintext (no auth) testing.
 */
export class PlaintextKafkaContainer {
    private container: StartedKafkaContainer | null = null;

    async start(): Promise<KafkaConnectionInfo> {
        console.log("Starting plaintext Kafka container...");
        
        this.container = await new KafkaContainer("confluentinc/cp-kafka:7.5.0")
            .withExposedPorts(9093)
            .start();

        const bootstrap = `${this.container.getHost()}:${this.container.getMappedPort(9093)}`;
        console.log(`Plaintext Kafka started at ${bootstrap}`);

        return { bootstrap };
    }

    async stop(): Promise<void> {
        if (this.container) {
            console.log("Stopping plaintext Kafka container...");
            await this.container.stop();
            this.container = null;
        }
    }
}

/**
 * Test fixture that manages container lifecycle for a test suite.
 */
export interface TestFixture {
    connectionInfo: KafkaConnectionInfo;
    stop(): Promise<void>;
}

/**
 * Creates a test fixture for plaintext Kafka.
 */
export async function createPlaintextFixture(): Promise<TestFixture> {
    const container = new PlaintextKafkaContainer();
    const connectionInfo = await container.start();
    return {
        connectionInfo,
        stop: () => container.stop(),
    };
}
