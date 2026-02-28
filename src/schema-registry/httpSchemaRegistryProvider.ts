import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

import { mapSchemaRegistryError, SchemaRegistryError } from "./errors";
import { SchemaRegistryProvider, SchemaRegistryRef, SchemaVersionDetail, SubjectSummary, VersionSummary } from "./types";

interface RequestResult {
    statusCode: number;
    body: string;
}

export class HttpSchemaRegistryProvider implements SchemaRegistryProvider {
    public async listSubjects(registryRef: SchemaRegistryRef): Promise<SubjectSummary[]> {
        const result = await this.request(registryRef, "/subjects");
        const subjects = this.parseJson<string[]>(result.body, "Invalid subjects response from Schema Registry.");
        return subjects.map(name => ({ name }));
    }

    public async listSubjectVersions(registryRef: SchemaRegistryRef, subject: string): Promise<VersionSummary[]> {
        const encodedSubject = encodeURIComponent(subject);
        const result = await this.request(registryRef, `/subjects/${encodedSubject}/versions`);
        const versions = this.parseJson<number[]>(result.body, `Invalid versions response for subject '${subject}'.`);
        return versions.map(version => ({ subject, version }));
    }

    public async getSchemaVersion(registryRef: SchemaRegistryRef, subject: string, version: number | "latest"): Promise<SchemaVersionDetail> {
        const encodedSubject = encodeURIComponent(subject);
        const result = await this.request(registryRef, `/subjects/${encodedSubject}/versions/${version}`);
        const body = this.parseJson<{
            id: number;
            subject: string;
            version: number;
            schemaType?: string;
            schema: string;
            references?: Array<{ name: string; subject: string; version: number }>;
        }>(result.body, `Invalid schema response for subject '${subject}' version '${version}'.`);

        const rawType = (body.schemaType || "AVRO").toUpperCase();
        const schemaType = rawType === "JSON" || rawType === "PROTOBUF" ? rawType : "AVRO";
        return {
            id: body.id,
            subject: body.subject,
            version: body.version,
            schemaType,
            schema: body.schema,
            references: body.references || []
        };
    }

    private parseJson<T>(body: string, errorMessage: string): T {
        try {
            return JSON.parse(body) as T;
        } catch (error) {
            throw mapSchemaRegistryError(error, errorMessage);
        }
    }

    private async request(registryRef: SchemaRegistryRef, requestPath: string): Promise<RequestResult> {
        const baseUrl = registryRef.connection.url;
        if (!baseUrl) {
            throw new SchemaRegistryError("not-configured", `Schema Registry URL is not configured for cluster '${registryRef.clusterName}'.`);
        }

        let url: URL;
        try {
            url = new URL(requestPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
        } catch (_error) {
            throw new SchemaRegistryError("api", `Invalid Schema Registry URL '${baseUrl}'.`);
        }

        const auth = registryRef.connection.auth;
        const tls = registryRef.connection.tls;
        const headers: http.OutgoingHttpHeaders = {};
        headers.accept = "application/vnd.schemaregistry.v1+json, application/json";
        if (auth?.username) {
            const token = Buffer.from(`${auth.username}:${auth.password || ""}`).toString("base64");
            headers.authorization = `Basic ${token}`;
        }

        const options: https.RequestOptions = {
            method: "GET",
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port ? Number(url.port) : undefined,
            path: `${url.pathname}${url.search}`,
            headers
        };

        if (tls) {
            options.ca = tls.ca ? fs.readFileSync(tls.ca) : undefined;
            options.cert = tls.cert ? fs.readFileSync(tls.cert) : undefined;
            options.key = tls.key ? fs.readFileSync(tls.key) : undefined;
            options.passphrase = tls.passphrase;
            options.rejectUnauthorized = tls.rejectUnauthorized;
        }

        return new Promise<RequestResult>((resolve, reject) => {
            const requester = url.protocol === "http:" ? http.request : https.request;
            const request = requester(options, response => {
                let responseBody = "";
                response.setEncoding("utf8");
                response.on("data", chunk => {
                    responseBody += chunk;
                });
                response.on("end", () => {
                    const statusCode = response.statusCode || 0;
                    if (statusCode >= 200 && statusCode < 300) {
                        resolve({ statusCode, body: responseBody });
                        return;
                    }

                    if (statusCode === 401 || statusCode === 403) {
                        reject(new SchemaRegistryError("auth", "Schema Registry authentication failed. Check username/password.", statusCode, responseBody));
                        return;
                    }
                    reject(new SchemaRegistryError("api", `Schema Registry API request failed (${statusCode}).`, statusCode, responseBody));
                });
            });

            request.setTimeout(10000, () => {
                request.destroy(new Error("Request timeout"));
            });

            request.on("error", error => {
                reject(mapSchemaRegistryError(error, "Schema Registry request failed."));
            });

            request.end();
        });
    }
}
