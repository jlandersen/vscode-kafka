import * as assert from "assert";
import { ConnectionOptions, SslOption } from "../../../client";

// Note: We're testing the interface structure and type compatibility here
// The actual createSsl function is internal to client.ts and requires filesystem access

suite("SSL Configuration Test Suite", () => {

    test("SslOption interface should accept all SSL fields", () => {
        const sslOption: SslOption = {
            ca: "/path/to/ca.pem",
            key: "/path/to/key.pem",
            cert: "/path/to/cert.pem",
            rejectUnauthorized: false
        };

        assert.strictEqual(sslOption.ca, "/path/to/ca.pem");
        assert.strictEqual(sslOption.key, "/path/to/key.pem");
        assert.strictEqual(sslOption.cert, "/path/to/cert.pem");
        assert.strictEqual(sslOption.rejectUnauthorized, false);
    });

    test("SslOption interface should accept passphrase field", () => {
        const sslOption: SslOption = {
            ca: "/path/to/ca.pem",
            key: "/path/to/key.pem",
            cert: "/path/to/cert.pem",
            passphrase: "my-secret-passphrase",
            rejectUnauthorized: true
        };

        assert.strictEqual(sslOption.ca, "/path/to/ca.pem");
        assert.strictEqual(sslOption.key, "/path/to/key.pem");
        assert.strictEqual(sslOption.cert, "/path/to/cert.pem");
        assert.strictEqual(sslOption.passphrase, "my-secret-passphrase");
        assert.strictEqual(sslOption.rejectUnauthorized, true);
    });

    test("SslOption with only passphrase (no other SSL fields)", () => {
        const sslOption: SslOption = {
            passphrase: "my-passphrase"
        };

        assert.strictEqual(sslOption.passphrase, "my-passphrase");
        assert.strictEqual(sslOption.ca, undefined);
        assert.strictEqual(sslOption.key, undefined);
        assert.strictEqual(sslOption.cert, undefined);
    });

    test("ConnectionOptions should accept SslOption with passphrase", () => {
        const connectionOptions: ConnectionOptions = {
            bootstrap: "localhost:9092",
            ssl: {
                ca: "/path/to/ca.pem",
                key: "/path/to/key.pem",
                cert: "/path/to/cert.pem",
                passphrase: "encrypted-key-password",
                rejectUnauthorized: true
            }
        };

        const ssl = connectionOptions.ssl as SslOption;
        assert.strictEqual(ssl.passphrase, "encrypted-key-password");
        assert.strictEqual(ssl.rejectUnauthorized, true);
    });

    test("SslOption with rejectUnauthorized=true", () => {
        const sslOption: SslOption = {
            ca: "/path/to/ca.pem",
            rejectUnauthorized: true
        };

        assert.strictEqual(sslOption.rejectUnauthorized, true);
    });

    test("SslOption with rejectUnauthorized=false (disable verification)", () => {
        const sslOption: SslOption = {
            ca: "/path/to/ca.pem",
            rejectUnauthorized: false
        };

        assert.strictEqual(sslOption.rejectUnauthorized, false);
    });

    test("SslOption with rejectUnauthorized undefined (default behavior)", () => {
        const sslOption: SslOption = {
            ca: "/path/to/ca.pem"
        };

        assert.strictEqual(sslOption.rejectUnauthorized, undefined);
    });

    test("ConnectionOptions should accept SslOption with rejectUnauthorized", () => {
        const connectionOptions: ConnectionOptions = {
            bootstrap: "localhost:9092",
            ssl: {
                ca: "/path/to/ca.pem",
                rejectUnauthorized: false
            }
        };

        const ssl = connectionOptions.ssl as SslOption;
        assert.strictEqual(ssl.rejectUnauthorized, false);
    });

    test("ConnectionOptions should accept ssl as boolean", () => {
        const connectionOptions: ConnectionOptions = {
            bootstrap: "localhost:9092",
            ssl: true
        };

        assert.strictEqual(connectionOptions.ssl, true);
    });

    test("SslOption should allow all fields to be optional", () => {
        const sslOption: SslOption = {};
        assert.ok(sslOption !== undefined);
    });

    test("SslOption with only rejectUnauthorized field", () => {
        const sslOption: SslOption = {
            rejectUnauthorized: false
        };

        assert.strictEqual(sslOption.ca, undefined);
        assert.strictEqual(sslOption.key, undefined);
        assert.strictEqual(sslOption.cert, undefined);
        assert.strictEqual(sslOption.rejectUnauthorized, false);
    });

});
