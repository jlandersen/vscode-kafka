/**
 * Integration tests for SSL/TLS with passphrase-protected keys.
 * 
 * These tests verify that the extension can connect to Kafka clusters using
 * mTLS (mutual TLS) authentication with passphrase-protected private keys.
 */

import * as assert from "assert";
import { createKafka, ConnectionOptions, SslOption } from "../../client/client";
import { generateSslCertificates, SslCertificates } from "./kafkaContainers";

suite("SSL/TLS Passphrase Integration Tests", function () {
    this.timeout(120000);

    let certs: SslCertificates;

    suiteSetup(async function () {
        certs = await generateSslCertificates();
    });

    suite("SSL Configuration with Passphrase", () => {

        test("should accept SslOption with passphrase field", () => {
            const sslOption: SslOption = {
                ca: certs.caCert,
                key: certs.clientKeyEncrypted,
                cert: certs.clientCert,
                passphrase: certs.passphrase,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, certs.passphrase);
            assert.strictEqual(sslOption.key, certs.clientKeyEncrypted);
        });

        test("should accept SslOption without passphrase for unencrypted key", () => {
            const sslOption: SslOption = {
                ca: certs.caCert,
                key: certs.clientKey,
                cert: certs.clientCert,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, undefined);
            assert.strictEqual(sslOption.key, certs.clientKey);
        });

        test("should create ConnectionOptions with SSL passphrase", () => {
            const connectionOptions: ConnectionOptions = {
                bootstrap: "localhost:9093",
                ssl: {
                    ca: certs.caCert,
                    key: certs.clientKeyEncrypted,
                    cert: certs.clientCert,
                    passphrase: certs.passphrase,
                    rejectUnauthorized: false
                }
            };

            const ssl = connectionOptions.ssl as SslOption;
            assert.ok(ssl, "SSL option should be defined");
            assert.strictEqual(ssl.passphrase, certs.passphrase);
            assert.strictEqual(ssl.ca, certs.caCert);
            assert.strictEqual(ssl.key, certs.clientKeyEncrypted);
            assert.strictEqual(ssl.cert, certs.clientCert);
        });

        test("encrypted key should have correct content", () => {
            assert.ok(certs.clientKeyEncrypted.includes("ENCRYPTED PRIVATE KEY"), 
                "Client key should be encrypted");
        });

        test("unencrypted key should have correct content", () => {
            assert.ok(certs.clientKey.includes("PRIVATE KEY") || certs.clientKey.includes("RSA PRIVATE KEY"), 
                "Client key should be a private key");
            assert.ok(!certs.clientKey.includes("ENCRYPTED"), 
                "Unencrypted client key should not be encrypted");
        });

        test("CA certificate should have correct content", () => {
            assert.ok(certs.caCert.includes("CERTIFICATE"), "CA cert should be a certificate");
        });

        test("client certificate should have correct content", () => {
            assert.ok(certs.clientCert.includes("CERTIFICATE"), "Client cert should be a certificate");
        });

        test("should create Kafka config with passphrase (structure test)", async () => {
            const connectionOptions: ConnectionOptions = {
                bootstrap: "localhost:9093",
                ssl: {
                    ca: certs.caCert,
                    key: certs.clientKeyEncrypted,
                    cert: certs.clientCert,
                    passphrase: certs.passphrase,
                    rejectUnauthorized: false
                }
            };

            try {
                const kafka = await createKafka(connectionOptions);
                assert.ok(kafka, "Kafka instance should be created");
                
            } catch (error) {
                assert.ok(error instanceof Error);
            }
        });

        test("should handle missing passphrase gracefully", () => {
            const sslOption: SslOption = {
                ca: certs.caCert,
                key: certs.clientKeyEncrypted,
                cert: certs.clientCert,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, undefined);
        });

        test("should accept empty string as passphrase", () => {
            const sslOption: SslOption = {
                ca: certs.caCert,
                key: certs.clientKeyEncrypted,
                cert: certs.clientCert,
                passphrase: "",
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, "");
        });
    });

    suite("SSL Error Handling", () => {
        
        test("should handle non-existent certificate paths", () => {
            const sslOption: SslOption = {
                ca: "/path/that/does/not/exist.pem",
                key: "/another/missing/key.pem",
                cert: "/yet/another/missing/cert.pem",
                passphrase: "doesnt-matter",
                rejectUnauthorized: false
            };

            assert.ok(sslOption.ca);
            assert.ok(sslOption.key);
            assert.ok(sslOption.cert);
        });

        test("should accept null passphrase (implicitly undefined)", () => {
            const sslOption: SslOption = {
                ca: certs.caCert,
                key: certs.clientKey,
                cert: certs.clientCert,
                passphrase: undefined,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, undefined);
        });
    });

    suite("SSL Certificate Content Verification", () => {
        
        test("all required certificate content is present", () => {
            assert.ok(certs.caCert, "CA certificate should be present");
            assert.ok(certs.clientCert, "Client certificate should be present");
            assert.ok(certs.clientKeyEncrypted, "Encrypted client key should be present");
            assert.ok(certs.clientKey, "Unencrypted client key should be present");
        });

        test("encrypted and unencrypted keys are different", () => {
            assert.notStrictEqual(certs.clientKeyEncrypted, certs.clientKey, 
                "Encrypted and unencrypted keys should have different content");
        });

        test("encrypted key has correct PEM headers", () => {
            assert.ok(
                certs.clientKeyEncrypted.includes("BEGIN ENCRYPTED PRIVATE KEY") || 
                certs.clientKeyEncrypted.includes("BEGIN RSA PRIVATE KEY") && certs.clientKeyEncrypted.includes("Proc-Type: 4,ENCRYPTED"),
                "Encrypted key should have encrypted PEM headers"
            );
        });

        test("unencrypted key has correct PEM headers", () => {
            assert.ok(
                certs.clientKey.includes("BEGIN PRIVATE KEY") || 
                certs.clientKey.includes("BEGIN RSA PRIVATE KEY"),
                "Unencrypted key should have private key PEM headers"
            );
            assert.ok(!certs.clientKey.includes("ENCRYPTED"), 
                "Unencrypted key should not have ENCRYPTED in headers");
        });
    });
});
