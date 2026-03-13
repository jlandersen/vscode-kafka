import * as assert from "assert";
import { clientTestHooks, ConnectionOptions } from "../../../client";

const { generateAwsMskIamToken, createAwsMskIamAuthenticator, createSaslOption } = clientTestHooks;

const AWS_CREDENTIALS = {
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const FIXED_DATE = new Date("2024-06-15T12:30:00.000Z");

suite("AWS MSK IAM Authentication Test Suite", () => {

    suite("generateAwsMskIamToken", () => {

        test("produces a valid base64-encoded JSON token", async () => {
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            assert.strictEqual(decoded.version, "2020_10_22");
            assert.strictEqual(decoded.host, "broker.example.com");
            assert.strictEqual(decoded["user-agent"], "vscode-kafka");
            assert.strictEqual(decoded.action, "kafka-cluster:Connect");
            assert.strictEqual(decoded["x-amz-algorithm"], "AWS4-HMAC-SHA256");
            assert.strictEqual(decoded["x-amz-signedheaders"], "host");
            assert.strictEqual(decoded["x-amz-expires"], "900");
        });

        test("includes correct credential scope in token", async () => {
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            const credential = decoded["x-amz-credential"];
            assert.ok(credential.startsWith(`${AWS_CREDENTIALS.accessKeyId}/`));
            assert.ok(credential.includes("/us-east-1/kafka-cluster/aws4_request"));
            assert.ok(credential.includes("20240615"));
        });

        test("includes amz-date matching the provided timestamp", async () => {
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            assert.strictEqual(decoded["x-amz-date"], "20240615T123000Z");
        });

        test("includes session token when provided", async () => {
            const sessionToken = "FwoGZXIvYXdzEBYaDHqa0AP1";
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                sessionToken,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            assert.strictEqual(decoded["x-amz-security-token"], sessionToken);
        });

        test("omits session token field when not provided", async () => {
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            assert.strictEqual("x-amz-security-token" in decoded, false);
        });

        test("produces a non-empty signature", async () => {
            const token = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );

            const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
            assert.ok(decoded["x-amz-signature"]);
            assert.ok(decoded["x-amz-signature"].length > 0);
            assert.ok(/^[0-9a-f]+$/.test(decoded["x-amz-signature"]));
        });

        test("same inputs produce same signature (deterministic)", async () => {
            const token1 = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            const token2 = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            assert.strictEqual(token1, token2);
        });

        test("different hosts produce different signatures", async () => {
            const token1 = await generateAwsMskIamToken(
                "broker1.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            const token2 = await generateAwsMskIamToken(
                "broker2.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            assert.notStrictEqual(token1, token2);
        });

        test("different regions produce different signatures", async () => {
            const token1 = await generateAwsMskIamToken(
                "broker.example.com",
                "us-east-1",
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            const token2 = await generateAwsMskIamToken(
                "broker.example.com",
                "eu-west-1",
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            assert.notStrictEqual(token1, token2);
        });

        test("session token changes the signature (ordering matters)", async () => {
            const tokenWithout = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                undefined,
                FIXED_DATE
            );
            const tokenWith = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                "FwoGZXIvYXdzEBYaDHqa0AP1",
                FIXED_DATE
            );
            const sigWithout = JSON.parse(Buffer.from(tokenWithout, "base64").toString("utf-8"))["x-amz-signature"];
            const sigWith = JSON.parse(Buffer.from(tokenWith, "base64").toString("utf-8"))["x-amz-signature"];
            assert.notStrictEqual(sigWithout, sigWith);
        });

        test("produces deterministic signature with session token", async () => {
            const token1 = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                "FwoGZXIvYXdzEBYaDHqa0AP1",
                FIXED_DATE
            );
            const token2 = await generateAwsMskIamToken(
                "broker.example.com",
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                "FwoGZXIvYXdzEBYaDHqa0AP1",
                FIXED_DATE
            );
            assert.strictEqual(token1, token2);
        });
    });

    suite("createAwsMskIamAuthenticator", () => {

        test("calls authenticateAPI with OAUTHBEARER auth bytes", (done) => {
            const authenticator = createAwsMskIamAuthenticator(
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey
            );

            const mockConnection = { host: "broker.example.com" };
            const mockAuthenticateAPI = (_conn: unknown, authBytes: Buffer, cb: (err: Error | null) => void) => {
                const authString = authBytes.toString("utf-8");
                assert.ok(authString.startsWith("n,,\x01auth=Bearer "));
                assert.ok(authString.endsWith("\x01\x01"));

                // The token between "Bearer " and the trailing \x01\x01 should be valid base64 JSON
                const tokenPart = authString.slice("n,,\x01auth=Bearer ".length, -2);
                const decoded = JSON.parse(Buffer.from(tokenPart, "base64").toString("utf-8"));
                assert.strictEqual(decoded.host, "broker.example.com");
                assert.strictEqual(decoded.version, "2020_10_22");

                cb(null);
            };

            authenticator(
                "OAUTHBEARER",
                mockConnection,
                mockAuthenticateAPI,
                undefined,
                undefined,
                undefined,
                (err: Error | null) => {
                    assert.strictEqual(err, null);
                    done();
                }
            );
        });

        test("passes the connection object through to authenticateAPI", (done) => {
            const authenticator = createAwsMskIamAuthenticator(
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey
            );

            const mockConnection = { host: "my-broker.kafka.amazonaws.com" };
            const mockAuthenticateAPI = (conn: unknown, _authBytes: Buffer, cb: (err: Error | null) => void) => {
                assert.strictEqual(conn, mockConnection);
                cb(null);
            };

            authenticator(
                "OAUTHBEARER",
                mockConnection,
                mockAuthenticateAPI,
                undefined, undefined, undefined,
                (err: Error | null) => {
                    assert.strictEqual(err, null);
                    done();
                }
            );
        });

        test("calls callback with error when connection has no host", (done) => {
            const authenticator = createAwsMskIamAuthenticator(
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey
            );

            const mockConnection = { host: undefined };
            const mockAuthenticateAPI = () => {
                assert.fail("authenticateAPI should not be called");
            };

            authenticator(
                "OAUTHBEARER",
                mockConnection,
                mockAuthenticateAPI,
                undefined, undefined, undefined,
                (err: Error | null) => {
                    assert.ok(err);
                    assert.ok(err!.message.includes("host not available"));
                    done();
                }
            );
        });

        test("includes session token in auth bytes when provided", (done) => {
            const sessionToken = "FwoGZXIvYXdzEBYaDHqa0AP1";
            const authenticator = createAwsMskIamAuthenticator(
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey,
                sessionToken
            );

            const mockConnection = { host: "broker.example.com" };
            const mockAuthenticateAPI = (_conn: unknown, authBytes: Buffer, cb: (err: Error | null) => void) => {
                const authString = authBytes.toString("utf-8");
                const tokenPart = authString.slice("n,,\x01auth=Bearer ".length, -2);
                const decoded = JSON.parse(Buffer.from(tokenPart, "base64").toString("utf-8"));
                assert.strictEqual(decoded["x-amz-security-token"], sessionToken);
                cb(null);
            };

            authenticator(
                "OAUTHBEARER",
                mockConnection,
                mockAuthenticateAPI,
                undefined, undefined, undefined,
                (err: Error | null) => {
                    assert.strictEqual(err, null);
                    done();
                }
            );
        });

        test("forwards authenticateAPI errors to callback", (done) => {
            const authenticator = createAwsMskIamAuthenticator(
                AWS_CREDENTIALS.region,
                AWS_CREDENTIALS.accessKeyId,
                AWS_CREDENTIALS.secretAccessKey
            );

            const mockConnection = { host: "broker.example.com" };
            const apiError = new Error("SASL handshake failed");
            const mockAuthenticateAPI = (_conn: unknown, _authBytes: Buffer, cb: (err: Error | null) => void) => {
                cb(apiError);
            };

            authenticator(
                "OAUTHBEARER",
                mockConnection,
                mockAuthenticateAPI,
                undefined, undefined, undefined,
                (err: Error | null) => {
                    assert.strictEqual(err, apiError);
                    done();
                }
            );
        });
    });

    suite("createSaslOption for AWS mechanism", () => {

        test("returns OAUTHBEARER mechanism with authenticate callback", () => {
            const options: ConnectionOptions = {
                bootstrap: "broker:9092",
                saslOption: {
                    mechanism: "aws",
                    awsRegion: AWS_CREDENTIALS.region,
                    awsAccessKeyId: AWS_CREDENTIALS.accessKeyId,
                    awsSecretAccessKey: AWS_CREDENTIALS.secretAccessKey,
                },
            };
            const result = createSaslOption(options) as Record<string, unknown>;
            assert.ok(result);
            assert.strictEqual(result.mechanism, "OAUTHBEARER");
            assert.strictEqual(typeof result.authenticate, "function");
        });

        test("returns undefined when awsRegion is missing", () => {
            const options: ConnectionOptions = {
                bootstrap: "broker:9092",
                saslOption: {
                    mechanism: "aws",
                    awsAccessKeyId: AWS_CREDENTIALS.accessKeyId,
                    awsSecretAccessKey: AWS_CREDENTIALS.secretAccessKey,
                },
            };
            assert.strictEqual(createSaslOption(options), undefined);
        });

        test("returns undefined when awsAccessKeyId is missing", () => {
            const options: ConnectionOptions = {
                bootstrap: "broker:9092",
                saslOption: {
                    mechanism: "aws",
                    awsRegion: AWS_CREDENTIALS.region,
                    awsSecretAccessKey: AWS_CREDENTIALS.secretAccessKey,
                },
            };
            assert.strictEqual(createSaslOption(options), undefined);
        });

        test("returns undefined when awsSecretAccessKey is missing", () => {
            const options: ConnectionOptions = {
                bootstrap: "broker:9092",
                saslOption: {
                    mechanism: "aws",
                    awsRegion: AWS_CREDENTIALS.region,
                    awsAccessKeyId: AWS_CREDENTIALS.accessKeyId,
                },
            };
            assert.strictEqual(createSaslOption(options), undefined);
        });

        test("returns undefined when no saslOption is set", () => {
            const options: ConnectionOptions = { bootstrap: "broker:9092" };
            assert.strictEqual(createSaslOption(options), undefined);
        });
    });
});
