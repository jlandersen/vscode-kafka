import * as vscode from "vscode";

import { SchemaVersionDetail } from "./types";

const SCHEMA_DOCUMENT_SCHEME = "kafka-schema";

export class SchemaRegistryDocumentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = SCHEMA_DOCUMENT_SCHEME;
    private readonly contentByUri = new Map<string, string>();

    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    public provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contentByUri.get(uri.toString()) || "";
    }

    public setDocumentContent(uri: vscode.Uri, content: string): void {
        this.contentByUri.set(uri.toString(), content);
        this.onDidChangeEmitter.fire(uri);
    }

    public buildVersionUri(subject: string, version: number, extension: string): vscode.Uri {
        const normalizedSubject = encodeURIComponent(subject);
        return vscode.Uri.parse(`${SCHEMA_DOCUMENT_SCHEME}:/${normalizedSubject}/v${version}.${extension}`);
    }

    public buildDocumentContent(detail: SchemaVersionDetail): string {
        const header = [
            `# Subject: ${detail.subject}`,
            `# Version: ${detail.version}`,
            `# Schema Type: ${detail.schemaType}`,
            `# Schema ID: ${detail.id}`,
            ""
        ];

        return header.join("\n") + detail.schema;
    }
}

export const getSchemaDocumentLanguage = (schemaType: string): { language: string; extension: string } => {
    const normalizedSchemaType = schemaType.toUpperCase();
    if (normalizedSchemaType === "PROTOBUF") {
        return { language: "proto3", extension: "proto" };
    }
    if (normalizedSchemaType === "JSON") {
        return { language: "json", extension: "json" };
    }
    return { language: "json", extension: "avsc" };
};
