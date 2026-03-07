/**
 * Test-specific Kafka client that extends PlatformaticClient for integration tests.
 *
 * Uses the real PlatformaticClient code paths (producer, consumer, admin, config pipeline)
 * but bypasses the VS Code extension context by providing a pre-built config directly.
 */

import { PlatformaticClient, PlatformaticClientConfig, Broker, Cluster, SaslOption } from "../../client/client";
import { ClientState } from "../../client";
import { KafkaConnectionInfo, SslConnectionInfo } from "./kafkaContainers";

function createTlsOption(ssl?: SslConnectionInfo): Record<string, unknown> | undefined {
    if (!ssl) {
        return undefined;
    }

    const tlsConfig: Record<string, unknown> = {
        rejectUnauthorized: false,
    };

    if (ssl.ca) {
        tlsConfig.ca = [ssl.ca];
    }
    if (ssl.cert) {
        tlsConfig.cert = ssl.cert;
    }
    if (ssl.key) {
        tlsConfig.key = ssl.key;
    }
    if (ssl.passphrase) {
        tlsConfig.passphrase = ssl.passphrase;
    }

    return tlsConfig;
}

function createSaslOption(sasl?: SaslOption): Record<string, unknown> | undefined {
    if (!sasl) {
        return undefined;
    }

    switch (sasl.mechanism) {
        case 'plain':
            if (sasl.username && sasl.password) {
                return { mechanism: 'PLAIN', username: sasl.username, password: sasl.password };
            }
            break;
        case 'scram-sha-256':
            if (sasl.username && sasl.password) {
                return { mechanism: 'SCRAM-SHA-256', username: sasl.username, password: sasl.password };
            }
            break;
        case 'scram-sha-512':
            if (sasl.username && sasl.password) {
                return { mechanism: 'SCRAM-SHA-512', username: sasl.username, password: sasl.password };
            }
            break;
    }
    return undefined;
}

function buildTestConfig(connectionInfo: KafkaConnectionInfo): PlatformaticClientConfig {
    const config: PlatformaticClientConfig = {
        clientId: "vscode-kafka-test",
        bootstrapBrokers: connectionInfo.bootstrap.split(","),
    };

    const sasl = createSaslOption(connectionInfo.saslOption);
    if (sasl) {
        config.sasl = sasl;
    }

    const tls = createTlsOption(connectionInfo.sslOption);
    if (tls) {
        config.tls = tls;
    }

    return config;
}

/**
 * A test-specific Kafka client that extends PlatformaticClient with:
 * - Pre-built config from KafkaConnectionInfo (no VS Code extension context needed)
 * - Retry logic on connect for testcontainers startup
 * - State tracking for test assertions
 */
export class TestKafkaClient extends PlatformaticClient {
    private _state: ClientState = ClientState.disconnected;

    override get state(): ClientState {
        return this._state;
    }

    constructor(connectionInfo: KafkaConnectionInfo, clusterId: string = "test-cluster") {
        const cluster: Cluster = {
            id: clusterId,
            name: `Test Cluster (${clusterId})`,
            bootstrap: connectionInfo.bootstrap,
            saslOption: connectionInfo.saslOption,
        };
        super(cluster, buildTestConfig(connectionInfo));
    }

    async connect(): Promise<void> {
        this._state = ClientState.connecting;
        try {
            // Retry metadata until brokers are available (testcontainers may not be fully ready)
            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    const admin = await this.getKafkaAdminClient();
                    admin.clearMetadata();
                    const metadata = await admin.metadata({} as any);
                    const brokers: Broker[] = Array.from(metadata.brokers.entries()).map(([nodeId, b]: [any, any]) => ({
                        id: String(nodeId),
                        host: b.host,
                        port: b.port,
                        isController: nodeId === metadata.controllerId,
                    }));
                    if (brokers.length > 0) {
                        break;
                    }
                } catch (error) {
                    if (attempt === 29) {
                        throw error;
                    }
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            this._state = ClientState.connected;
        } catch (error) {
            this._state = ClientState.invalid;
            throw error;
        }
    }
}

/**
 * Creates a test Kafka client from connection info.
 */
export function createTestClient(connectionInfo: KafkaConnectionInfo, clusterId?: string): TestKafkaClient {
    return new TestKafkaClient(connectionInfo, clusterId);
}
