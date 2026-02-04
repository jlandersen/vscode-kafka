/**
 * Kafka container helpers for integration tests.
 * 
 * This module provides utilities to start Kafka containers with different
 * authentication configurations using testcontainers.
 */

import { KafkaContainer, StartedKafkaContainer } from "@testcontainers/kafka";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import * as path from "path";
import * as fs from "fs";

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
    oauthOption?: {
        tokenEndpoint: string;
        clientId: string;
        clientSecret: string;
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
 * Manages a Keycloak container for OAuth testing.
 * This allows testing the OAuth token fetch functionality.
 */
export class KeycloakContainer {
    private container: StartedTestContainer | null = null;
    private tokenEndpoint: string = "";

    async start(): Promise<{ tokenEndpoint: string; clientId: string; clientSecret: string }> {
        console.log("Starting Keycloak container...");

        // Read the realm configuration
        const realmConfigPath = path.resolve(__dirname, "../../../test-clusters/oauth/keycloak-realm.json");
        let realmConfig: string;
        
        try {
            realmConfig = fs.readFileSync(realmConfigPath, "utf-8");
        } catch {
            // Fallback to inline config if file not found
            realmConfig = JSON.stringify({
                realm: "kafka",
                enabled: true,
                sslRequired: "none",
                clients: [
                    {
                        clientId: "kafka-client",
                        name: "Kafka Client",
                        enabled: true,
                        clientAuthenticatorType: "client-secret",
                        secret: "kafka-client-secret",
                        serviceAccountsEnabled: true,
                        standardFlowEnabled: false,
                        directAccessGrantsEnabled: true,
                        publicClient: false,
                        protocol: "openid-connect",
                    },
                ],
            });
        }

        this.container = await new GenericContainer("quay.io/keycloak/keycloak:23.0")
            .withEnvironment({
                KEYCLOAK_ADMIN: "admin",
                KEYCLOAK_ADMIN_PASSWORD: "admin",
            })
            .withExposedPorts(8080)
            .withCopyContentToContainer([
                {
                    content: realmConfig,
                    target: "/opt/keycloak/data/import/kafka-realm.json",
                },
            ])
            .withCommand(["start-dev", "--import-realm"])
            // Use log message wait strategy - more reliable than HTTP health check
            .withWaitStrategy(Wait.forLogMessage(/Running the server in development mode/, 1).withStartupTimeout(120000))
            .start();

        const host = this.container.getHost();
        const port = this.container.getMappedPort(8080);
        this.tokenEndpoint = `http://${host}:${port}/realms/kafka/protocol/openid-connect/token`;

        console.log(`Keycloak started at http://${host}:${port}`);
        console.log(`Token endpoint: ${this.tokenEndpoint}`);

        return {
            tokenEndpoint: this.tokenEndpoint,
            clientId: "kafka-client",
            clientSecret: "kafka-client-secret",
        };
    }

    async stop(): Promise<void> {
        if (this.container) {
            console.log("Stopping Keycloak container...");
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
 * OAuth test fixture with Keycloak (no Kafka).
 */
export interface OAuthTestFixture {
    tokenEndpoint: string;
    clientId: string;
    clientSecret: string;
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

/**
 * Manages a Kafka container running in KRaft mode (without Zookeeper).
 * KRaft is the new consensus protocol for Kafka that replaces Zookeeper.
 * 
 * This tests the issue reported in https://github.com/jlandersen/vscode-kafka/issues/248
 * where consumers couldn't consume from KRaft-based clusters.
 */
export class KRaftKafkaContainer {
    private container: StartedKafkaContainer | null = null;

    async start(): Promise<KafkaConnectionInfo> {
        console.log("Starting KRaft Kafka container (without Zookeeper)...");
        
        // Use a recent Kafka version that supports KRaft mode
        // Kafka 3.3+ has stable KRaft support
        this.container = await new KafkaContainer("confluentinc/cp-kafka:7.7.1")
            .withExposedPorts(9093)
            .withKraft() // Enable KRaft mode (no Zookeeper)
            .start();

        const bootstrap = `${this.container.getHost()}:${this.container.getMappedPort(9093)}`;
        console.log(`KRaft Kafka started at ${bootstrap}`);

        return { bootstrap };
    }

    async stop(): Promise<void> {
        if (this.container) {
            console.log("Stopping KRaft Kafka container...");
            await this.container.stop();
            this.container = null;
        }
    }
}

/**
 * Creates a test fixture for OAuth token testing (Keycloak only).
 * This is useful for testing the OAuth token fetch functionality
 * without needing a full Kafka + OAUTHBEARER setup.
 */
export async function createOAuthFixture(): Promise<OAuthTestFixture> {
    const container = new KeycloakContainer();
    const config = await container.start();
    return {
        ...config,
        stop: () => container.stop(),
    };
}

/**
 * Creates a test fixture for KRaft Kafka (no Zookeeper).
 */
export async function createKRaftFixture(): Promise<TestFixture> {
    const container = new KRaftKafkaContainer();
    const connectionInfo = await container.start();
    return {
        connectionInfo,
        stop: () => container.stop(),
    };
}
