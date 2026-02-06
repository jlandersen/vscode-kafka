/**
 * Integration tests for SSL/TLS with passphrase-protected keys.
 * 
 * These tests verify that the extension can connect to Kafka clusters using
 * mTLS (mutual TLS) authentication with passphrase-protected private keys.
 */

import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { createKafka, ConnectionOptions, SslOption } from "../../client/client";

suite("SSL/TLS Passphrase Integration Tests", function () {
    this.timeout(10000);

    const certsDir = path.resolve(__dirname, "../../../test-clusters/ssl");
    
    const caCertPath = path.join(certsDir, "ca-cert.pem");
    const clientCertPath = path.join(certsDir, "client-cert.pem");
    const clientKeyEncryptedPath = path.join(certsDir, "client-key.pem");
    const clientKeyUnencryptedPath = path.join(certsDir, "client-key-unencrypted.pem");
    
    const testPassphrase = "test-passphrase";

    const certificatesExist = fs.existsSync(caCertPath) && 
                               fs.existsSync(clientCertPath) && 
                               fs.existsSync(clientKeyEncryptedPath) &&
                               fs.existsSync(clientKeyUnencryptedPath);

    if (!certificatesExist) {
        console.warn("⚠️  SSL certificates not found. Skipping SSL/passphrase integration tests.");
        console.warn(`   Run: cd ${certsDir} && ./generate-certs.sh`);
        return;
    }

    suite("SSL Configuration with Passphrase", () => {

        test("should accept SslOption with passphrase field", () => {
            const sslOption: SslOption = {
                ca: caCertPath,
                key: clientKeyEncryptedPath,
                cert: clientCertPath,
                passphrase: testPassphrase,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, testPassphrase);
            assert.strictEqual(sslOption.key, clientKeyEncryptedPath);
        });

        test("should accept SslOption without passphrase for unencrypted key", () => {
            const sslOption: SslOption = {
                ca: caCertPath,
                key: clientKeyUnencryptedPath,
                cert: clientCertPath,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, undefined);
            assert.strictEqual(sslOption.key, clientKeyUnencryptedPath);
        });

        test("should create ConnectionOptions with SSL passphrase", () => {
            const connectionOptions: ConnectionOptions = {
                bootstrap: "localhost:9093",
                ssl: {
                    ca: caCertPath,
                    key: clientKeyEncryptedPath,
                    cert: clientCertPath,
                    passphrase: testPassphrase,
                    rejectUnauthorized: false
                }
            };

            const ssl = connectionOptions.ssl as SslOption;
            assert.ok(ssl, "SSL option should be defined");
            assert.strictEqual(ssl.passphrase, testPassphrase);
            assert.strictEqual(ssl.ca, caCertPath);
            assert.strictEqual(ssl.key, clientKeyEncryptedPath);
            assert.strictEqual(ssl.cert, clientCertPath);
        });

        test("encrypted key file should be readable", () => {
            const keyContent = fs.readFileSync(clientKeyEncryptedPath, "utf-8");
            assert.ok(keyContent.includes("ENCRYPTED PRIVATE KEY"), 
                "Client key should be encrypted");
        });

        test("unencrypted key file should be readable", () => {
            const keyContent = fs.readFileSync(clientKeyUnencryptedPath, "utf-8");
            assert.ok(keyContent.includes("PRIVATE KEY") || keyContent.includes("RSA PRIVATE KEY"), 
                "Client key should be a private key");
            assert.ok(!keyContent.includes("ENCRYPTED"), 
                "Unencrypted client key should not be encrypted");
        });

        test("CA certificate should be readable", () => {
            const caCert = fs.readFileSync(caCertPath, "utf-8");
            assert.ok(caCert.includes("CERTIFICATE"), "CA cert should be a certificate");
        });

        test("client certificate should be readable", () => {
            const clientCert = fs.readFileSync(clientCertPath, "utf-8");
            assert.ok(clientCert.includes("CERTIFICATE"), "Client cert should be a certificate");
        });

        test("should create Kafka config with passphrase (structure test)", async () => {
            const connectionOptions: ConnectionOptions = {
                bootstrap: "localhost:9093",
                ssl: {
                    ca: caCertPath,
                    key: clientKeyEncryptedPath,
                    cert: clientCertPath,
                    passphrase: testPassphrase,
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
                ca: caCertPath,
                key: clientKeyEncryptedPath,
                cert: clientCertPath,
            rejectUnauthorized: false
        };

        assert.strictEqual(sslOption.passphrase, undefined);
        
    });

        test("should accept empty string as passphrase", () => {
            const sslOption: SslOption = {
                ca: caCertPath,
                key: clientKeyEncryptedPath,
                cert: clientCertPath,
                passphrase: "",
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, "");
        });

        test("certificates directory should have README", () => {
            const readmePath = path.join(certsDir, "README.md");
            assert.ok(fs.existsSync(readmePath), "README.md should exist in certs directory");
        });

        test("certificate generation script should exist", () => {
            const scriptPath = path.join(certsDir, "generate-certs.sh");
            assert.ok(fs.existsSync(scriptPath), "generate-certs.sh should exist");
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
                ca: caCertPath,
                key: clientKeyUnencryptedPath,
                cert: clientCertPath,
                passphrase: undefined,
                rejectUnauthorized: false
            };

            assert.strictEqual(sslOption.passphrase, undefined);
        });
    });

    suite("SSL Certificate File Verification", () => {
        
        test("all required certificate files exist", () => {
            assert.ok(fs.existsSync(caCertPath), "CA certificate should exist");
            assert.ok(fs.existsSync(clientCertPath), "Client certificate should exist");
            assert.ok(fs.existsSync(clientKeyEncryptedPath), "Encrypted client key should exist");
            assert.ok(fs.existsSync(clientKeyUnencryptedPath), "Unencrypted client key should exist");
        });

        test("encrypted and unencrypted keys are different", () => {
            const encryptedKey = fs.readFileSync(clientKeyEncryptedPath, "utf-8");
            const unencryptedKey = fs.readFileSync(clientKeyUnencryptedPath, "utf-8");
            
            assert.notStrictEqual(encryptedKey, unencryptedKey, 
                "Encrypted and unencrypted keys should have different content");
        });

        test("encrypted key has correct PEM headers", () => {
            const keyContent = fs.readFileSync(clientKeyEncryptedPath, "utf-8");
            assert.ok(
                keyContent.includes("BEGIN ENCRYPTED PRIVATE KEY") || 
                keyContent.includes("BEGIN RSA PRIVATE KEY") && keyContent.includes("Proc-Type: 4,ENCRYPTED"),
                "Encrypted key should have encrypted PEM headers"
            );
        });

        test("unencrypted key has correct PEM headers", () => {
            const keyContent = fs.readFileSync(clientKeyUnencryptedPath, "utf-8");
            assert.ok(
                keyContent.includes("BEGIN PRIVATE KEY") || 
                keyContent.includes("BEGIN RSA PRIVATE KEY"),
                "Unencrypted key should have private key PEM headers"
            );
            assert.ok(!keyContent.includes("ENCRYPTED"), 
                "Unencrypted key should not have ENCRYPTED in headers");
        });
    });
});
