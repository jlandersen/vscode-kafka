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
 * SSL connection options.
 */
export interface SslConnectionInfo {
    ca: string;
    cert: string;
    key: string;
    passphrase?: string;
}

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
    sslOption?: SslConnectionInfo;
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

        const realmConfigPath = path.resolve(__dirname, "../../../test-clusters/oauth/keycloak-realm.json");
        let realmConfig: string;
        
        try {
            realmConfig = fs.readFileSync(realmConfigPath, "utf-8");
        } catch {
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
        
        this.container = await new KafkaContainer("confluentinc/cp-kafka:7.7.1")
            .withExposedPorts(9093)
            .withKraft()
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

/**
 * Generated PKCS12 keystores for Kafka SSL configuration.
 */
interface Pkcs12Stores {
    keystore: Buffer;
    truststore: Buffer;
    password: string;
}

/**
 * Generates PKCS12 keystore and truststore from PEM certificates using a Docker container with keytool.
 * This is necessary because the Kafka container requires PKCS12 format, and openssl alone
 * cannot create truststores that Java/Kafka accepts properly.
 */
async function generatePkcs12Stores(
    caCert: string,
    serverCert: string,
    serverKey: string,
    password: string
): Promise<Pkcs12Stores> {
    const os = require("os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kafka-ssl-"));
    
    try {
        fs.writeFileSync(path.join(tmpDir, "ca-cert.pem"), caCert);
        fs.writeFileSync(path.join(tmpDir, "server-cert.pem"), serverCert);
        fs.writeFileSync(path.join(tmpDir, "server-key.pem"), serverKey);
        
        const script = `
            set -e
            cd /certs
            
            # Create PKCS12 keystore from server cert and key
            openssl pkcs12 -export \
                -in server-cert.pem \
                -inkey server-key.pem \
                -out keystore.p12 \
                -name kafka \
                -passout pass:${password} \
                -CAfile ca-cert.pem
            
            # Create PKCS12 truststore using keytool (Java's tool)
            keytool -importcert \
                -storetype PKCS12 \
                -keystore truststore.p12 \
                -storepass ${password} \
                -alias ca \
                -file ca-cert.pem \
                -noprompt
            
            chmod 644 keystore.p12 truststore.p12
        `;
        
        fs.writeFileSync(path.join(tmpDir, "generate.sh"), script);

        const container = await new GenericContainer("eclipse-temurin:17-jdk")
            .withBindMounts([{
                source: tmpDir,
                target: "/certs",
                mode: "rw"
            }])
            .withCommand(["bash", "/certs/generate.sh"])
            .withWaitStrategy(Wait.forOneShotStartup())
            .start();
        
        await container.stop();

        const keystore = fs.readFileSync(path.join(tmpDir, "keystore.p12"));
        const truststore = fs.readFileSync(path.join(tmpDir, "truststore.p12"));

        return { keystore, truststore, password };
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

/**
 * Manages a Kafka container with SASL/SCRAM-SHA-256 authentication.
 * Note: Uses Zookeeper mode because KRaft + SASL_SSL has container startup issues.
 */
export class SaslScramKafkaContainer {
    private kafkaContainer: StartedKafkaContainer | null = null;
    private caCert: string = "";

    async start(): Promise<KafkaConnectionInfo> {
        console.log("Starting SASL/SCRAM-SHA-256 Kafka container...");

        const sslDir = path.resolve(__dirname, "../../../test-clusters/ssl");
        this.caCert = fs.readFileSync(path.join(sslDir, "ca-cert.pem"), "utf-8");
        const serverCert = fs.readFileSync(path.join(sslDir, "server-cert.pem"), "utf-8");
        const serverKey = fs.readFileSync(path.join(sslDir, "server-key.pem"), "utf-8");

        console.log("Generating PKCS12 keystores...");
        const stores = await generatePkcs12Stores(this.caCert, serverCert, serverKey, "test-password");

        this.kafkaContainer = await new KafkaContainer("confluentinc/cp-kafka:7.5.0")
            .withSaslSslListener({
                port: 9094,
                sasl: {
                    mechanism: "SCRAM-SHA-256",
                    user: {
                        name: "testuser",
                        password: "testpassword",
                    },
                },
                keystore: {
                    content: stores.keystore,
                    passphrase: stores.password,
                },
                truststore: {
                    content: stores.truststore,
                    passphrase: stores.password,
                },
            })
            .withStartupTimeout(120000)
            .start();

        const bootstrap = `${this.kafkaContainer.getHost()}:${this.kafkaContainer.getMappedPort(9094)}`;
        console.log(`SASL/SCRAM-SHA-256 Kafka started at ${bootstrap}`);

        return {
            bootstrap,
            saslOption: {
                mechanism: "scram-sha-256",
                username: "testuser",
                password: "testpassword",
            },
            sslOption: {
                ca: this.caCert,
                cert: "",
                key: "",
            },
        };
    }

    async stop(): Promise<void> {
        if (this.kafkaContainer) {
            console.log("Stopping SASL/SCRAM-SHA-256 Kafka container...");
            await this.kafkaContainer.stop();
            this.kafkaContainer = null;
        }
    }
}

/**
 * Manages a Kafka container with SSL/TLS (mTLS) authentication.
 * Note: Uses Zookeeper mode because KRaft + SASL_SSL has container startup issues.
 */
export class SslKafkaContainer {
    private kafkaContainer: StartedKafkaContainer | null = null;
    private caCert: string = "";
    private clientCert: string = "";
    private clientKey: string = "";

    async start(): Promise<KafkaConnectionInfo> {
        console.log("Starting SSL Kafka container...");

        const sslDir = path.resolve(__dirname, "../../../test-clusters/ssl");
        this.caCert = fs.readFileSync(path.join(sslDir, "ca-cert.pem"), "utf-8");
        this.clientCert = fs.readFileSync(path.join(sslDir, "client-cert.pem"), "utf-8");
        this.clientKey = fs.readFileSync(path.join(sslDir, "client-key-unencrypted.pem"), "utf-8");
        const serverCert = fs.readFileSync(path.join(sslDir, "server-cert.pem"), "utf-8");
        const serverKey = fs.readFileSync(path.join(sslDir, "server-key.pem"), "utf-8");

        console.log("Generating PKCS12 keystores...");
        const stores = await generatePkcs12Stores(this.caCert, serverCert, serverKey, "test-password");

        this.kafkaContainer = await new KafkaContainer("confluentinc/cp-kafka:7.5.0")
            .withSaslSslListener({
                port: 9094,
                sasl: {
                    mechanism: "SCRAM-SHA-256",
                    user: {
                        name: "testuser",
                        password: "testpassword",
                    },
                },
                keystore: {
                    content: stores.keystore,
                    passphrase: stores.password,
                },
                truststore: {
                    content: stores.truststore,
                    passphrase: stores.password,
                },
            })
            .withStartupTimeout(120000)
            .start();

        const bootstrap = `${this.kafkaContainer.getHost()}:${this.kafkaContainer.getMappedPort(9094)}`;
        console.log(`SSL Kafka started at ${bootstrap}`);

        return {
            bootstrap,
            saslOption: {
                mechanism: "scram-sha-256",
                username: "testuser",
                password: "testpassword",
            },
            sslOption: {
                ca: this.caCert,
                cert: this.clientCert,
                key: this.clientKey,
            },
        };
    }

    async stop(): Promise<void> {
        if (this.kafkaContainer) {
            console.log("Stopping SSL Kafka container...");
            await this.kafkaContainer.stop();
            this.kafkaContainer = null;
        }
    }
}

/**
 * Creates a test fixture for SASL/SCRAM-SHA-256 Kafka.
 */
export async function createSaslScramFixture(): Promise<TestFixture> {
    const container = new SaslScramKafkaContainer();
    const connectionInfo = await container.start();
    return {
        connectionInfo,
        stop: () => container.stop(),
    };
}

/**
 * Creates a test fixture for SSL Kafka.
 */
export async function createSslFixture(): Promise<TestFixture> {
    const container = new SslKafkaContainer();
    const connectionInfo = await container.start();
    return {
        connectionInfo,
        stop: () => container.stop(),
    };
}
