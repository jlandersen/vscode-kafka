import * as assert from "assert";
import * as http from "http";

import { HttpSchemaRegistryProvider, SchemaRegistryError, SchemaRegistryRef } from "../../../schema-registry";

suite("Schema Registry Provider Test Suite", () => {
    const provider = new HttpSchemaRegistryProvider();

    test("lists subjects, versions, and schema detail", async () => {
        const server = await createServer((request, response) => {
            if (request.url === "/subjects") {
                response.setHeader("content-type", "application/json");
                response.writeHead(200);
                response.end(JSON.stringify(["orders-value", "orders-key"]));
                return;
            }
            if (request.url === "/subjects/orders-value/versions") {
                response.setHeader("content-type", "application/json");
                response.writeHead(200);
                response.end(JSON.stringify([1, 2]));
                return;
            }
            if (request.url === "/subjects/orders-value/versions/2") {
                response.setHeader("content-type", "application/json");
                response.writeHead(200);
                response.end(JSON.stringify({
                    subject: "orders-value",
                    version: 2,
                    id: 12,
                    schemaType: "JSON",
                    schema: '{"type":"object"}',
                    references: []
                }));
                return;
            }

            response.writeHead(404);
            response.end();
        });

        try {
            const registryRef = createRegistryRef(server);
            const subjects = await provider.listSubjects(registryRef);
            assert.deepStrictEqual(subjects.map(subject => subject.name), ["orders-value", "orders-key"]);

            const versions = await provider.listSubjectVersions(registryRef, "orders-value");
            assert.deepStrictEqual(versions.map(version => version.version), [1, 2]);

            const detail = await provider.getSchemaVersion(registryRef, "orders-value", 2);
            assert.strictEqual(detail.schemaType, "JSON");
            assert.strictEqual(detail.id, 12);
            assert.strictEqual(detail.version, 2);
        } finally {
            await closeServer(server);
        }
    });

    test("maps auth failures to typed errors", async () => {
        const server = await createServer((_request, response) => {
            response.setHeader("content-type", "application/json");
            response.writeHead(401);
            response.end(JSON.stringify({ message: "Unauthorized" }));
        });

        try {
            const registryRef = createRegistryRef(server);
            await assert.rejects(async () => {
                await provider.listSubjects(registryRef);
            }, (error: unknown) => {
                assert.ok(error instanceof SchemaRegistryError);
                assert.strictEqual((error as SchemaRegistryError).code, "auth");
                return true;
            });
        } finally {
            await closeServer(server);
        }
    });
});

async function createServer(
    listener: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<http.Server> {
    const server = http.createServer(listener);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
    return server;
}

function createRegistryRef(server: http.Server): SchemaRegistryRef {
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Unexpected server address");
    }

    return {
        id: "registry",
        name: "registry",
        clusterId: "cluster",
        clusterName: "cluster",
        connection: {
            url: `http://127.0.0.1:${address.port}`
        }
    };
}

async function closeServer(server: http.Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close(error => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
