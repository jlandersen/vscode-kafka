import * as assert from "assert";
import { convertToClientConfig } from "../../../client/client";

suite("Convert To Client Config Test Suite", () => {

    test("sets clientId from config", () => {
        const result = convertToClientConfig({ clientId: "my-client", brokers: ["b:9092"] });
        assert.strictEqual(result.clientId, "my-client");
    });

    test("defaults clientId to vscode-kafka when empty", () => {
        const result = convertToClientConfig({ clientId: "", brokers: ["b:9092"] });
        assert.strictEqual(result.clientId, "vscode-kafka");
    });

    test("defaults clientId to vscode-kafka when undefined", () => {
        const result = convertToClientConfig({ brokers: ["b:9092"] });
        assert.strictEqual(result.clientId, "vscode-kafka");
    });

    test("maps brokers to bootstrapBrokers", () => {
        const result = convertToClientConfig({ brokers: ["b1:9092", "b2:9093"] });
        assert.deepStrictEqual(result.bootstrapBrokers, ["b1:9092", "b2:9093"]);
    });

    suite("TLS mapping", () => {

        test("no tls when ssl is absent", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"] });
            assert.strictEqual(result.tls, undefined);
        });

        test("empty tls object when ssl is true (boolean)", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"], ssl: true });
            assert.deepStrictEqual(result.tls, {});
        });

        test("passes through ssl object as tls", () => {
            const sslConfig = {
                ca: "ca-cert",
                key: "key-data",
                cert: "cert-data",
                passphrase: "secret",
                rejectUnauthorized: false,
            };
            const result = convertToClientConfig({ brokers: ["b:9092"], ssl: sslConfig });
            assert.deepStrictEqual(result.tls, sslConfig);
        });
    });

    suite("SASL mechanism uppercasing", () => {

        test("no sasl when absent", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"] });
            assert.strictEqual(result.sasl, undefined);
        });

        test("uppercases plain to PLAIN", () => {
            const result = convertToClientConfig({
                brokers: ["b:9092"],
                sasl: { mechanism: "plain", username: "u", password: "p" },
            });
            assert.strictEqual(result.sasl?.mechanism, "PLAIN");
        });

        test("uppercases scram-sha-256 to SCRAM-SHA-256", () => {
            const result = convertToClientConfig({
                brokers: ["b:9092"],
                sasl: { mechanism: "scram-sha-256", username: "u", password: "p" },
            });
            assert.strictEqual(result.sasl?.mechanism, "SCRAM-SHA-256");
        });

        test("uppercases scram-sha-512 to SCRAM-SHA-512", () => {
            const result = convertToClientConfig({
                brokers: ["b:9092"],
                sasl: { mechanism: "scram-sha-512", username: "u", password: "p" },
            });
            assert.strictEqual(result.sasl?.mechanism, "SCRAM-SHA-512");
        });

        test("preserves additional SASL properties", () => {
            const result = convertToClientConfig({
                brokers: ["b:9092"],
                sasl: { mechanism: "plain", username: "admin", password: "secret" },
            });
            assert.strictEqual((result.sasl as any).username, "admin");
            assert.strictEqual((result.sasl as any).password, "secret");
        });

        test("does not include mechanism in rest properties", () => {
            const result = convertToClientConfig({
                brokers: ["b:9092"],
                sasl: { mechanism: "plain", username: "u", password: "p" },
            });
            // mechanism should be uppercased, not duplicated from rest
            const keys = Object.keys(result.sasl!);
            const mechanismCount = keys.filter(k => k === "mechanism").length;
            assert.strictEqual(mechanismCount, 1);
        });
    });

    suite("Timeout mapping", () => {

        test("no connectTimeout when connectionTimeout is absent", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"] });
            assert.strictEqual(result.connectTimeout, undefined);
        });

        test("maps connectionTimeout to connectTimeout", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"], connectionTimeout: 5000 });
            assert.strictEqual(result.connectTimeout, 5000);
        });

        test("no requestTimeout when absent", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"] });
            assert.strictEqual(result.requestTimeout, undefined);
        });

        test("maps requestTimeout", () => {
            const result = convertToClientConfig({ brokers: ["b:9092"], requestTimeout: 30000 });
            assert.strictEqual(result.requestTimeout, 30000);
        });
    });
});
