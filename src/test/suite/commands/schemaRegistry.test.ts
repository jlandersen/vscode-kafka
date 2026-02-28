import * as assert from "assert";
import * as vscode from "vscode";

import {
    CompareSchemaRegistryVersionsCommandHandler,
    createSchemaRegistryVersionNodeForTests,
    OpenSchemaRegistryVersionCommandHandler
} from "../../../commands/schemaRegistry";
import { SchemaRegistryDocumentProvider, SchemaRegistryProvider, SchemaVersionDetail } from "../../../schema-registry";

suite("Schema Registry Commands Test Suite", () => {
    test("open version returns immediately when item is undefined", async () => {
        let openDocumentCalls = 0;
        const originalOpenTextDocument = vscode.workspace.openTextDocument;

        try {
            (vscode.workspace as any).openTextDocument = async () => {
                openDocumentCalls++;
                return {} as vscode.TextDocument;
            };

            const handler = new OpenSchemaRegistryVersionCommandHandler(new SchemaRegistryDocumentProvider());
            await handler.execute(undefined);

            assert.strictEqual(openDocumentCalls, 0);
        } finally {
            (vscode.workspace as any).openTextDocument = originalOpenTextDocument;
        }
    });

    test("open version resolves schema and opens document with language", async () => {
        const provider = createProvider([
            createDetail("orders-value", 2, "JSON")
        ]);
        const versionNode = createSchemaRegistryVersionNodeForTests(provider, "orders-value", 2);
        const documentProvider = new SchemaRegistryDocumentProvider();
        const handler = new OpenSchemaRegistryVersionCommandHandler(documentProvider);

        const originalOpenTextDocument = vscode.workspace.openTextDocument;
        const originalSetLanguage = vscode.languages.setTextDocumentLanguage;
        const originalShowTextDocument = vscode.window.showTextDocument;

        const calls: { openUri?: vscode.Uri; language?: string; showDocument?: vscode.TextDocument } = {};
        const fakeDocument = { uri: vscode.Uri.parse("kafka-schema:/orders-value/v2.json") } as vscode.TextDocument;

        try {
            (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
                calls.openUri = uri;
                return fakeDocument;
            };
            (vscode.languages as any).setTextDocumentLanguage = async (document: vscode.TextDocument, languageId: string) => {
                calls.language = languageId;
                return document;
            };
            (vscode.window as any).showTextDocument = async (document: vscode.TextDocument) => {
                calls.showDocument = document;
                return {} as vscode.TextEditor;
            };

            await handler.execute(versionNode);

            assert.strictEqual(calls.openUri?.scheme, "kafka-schema");
            assert.strictEqual(calls.language, "json");
            assert.strictEqual(calls.showDocument, fakeDocument);
        } finally {
            (vscode.workspace as any).openTextDocument = originalOpenTextDocument;
            (vscode.languages as any).setTextDocumentLanguage = originalSetLanguage;
            (vscode.window as any).showTextDocument = originalShowTextDocument;
        }
    });

    test("compare shows information when subject has fewer than two versions", async () => {
        const provider = createProvider([
            createDetail("orders-value", 1, "AVRO")
        ]);
        const versionNode = createSchemaRegistryVersionNodeForTests(provider, "orders-value", 1);
        const subjectNode = versionNode.getParent();

        const originalShowInformationMessage = vscode.window.showInformationMessage;
        const originalQuickPick = vscode.window.showQuickPick;

        let infoMessage: string | undefined;
        let quickPickCalls = 0;

        try {
            (vscode.window as any).showInformationMessage = async (message: string) => {
                infoMessage = message;
                return undefined;
            };
            (vscode.window as any).showQuickPick = async () => {
                quickPickCalls++;
                return undefined;
            };

            const handler = createCompareHandlerWithDocumentProvider(
                new SchemaRegistryDocumentProvider(),
                new OpenSchemaRegistryVersionCommandHandler(new SchemaRegistryDocumentProvider())
            );
            await handler.execute(subjectNode as any);

            assert.strictEqual(infoMessage, "At least two schema versions are required for compare.");
            assert.strictEqual(quickPickCalls, 0);
        } finally {
            (vscode.window as any).showInformationMessage = originalShowInformationMessage;
            (vscode.window as any).showQuickPick = originalQuickPick;
        }
    });

    test("compare opens diff for selected versions", async () => {
        const provider = createProvider([
            createDetail("orders-value", 1, "AVRO"),
            createDetail("orders-value", 2, "JSON"),
            createDetail("orders-value", 3, "PROTOBUF")
        ]);
        const versionNode = createSchemaRegistryVersionNodeForTests(provider, "orders-value", 2);
        const documentProvider = new SchemaRegistryDocumentProvider();
        const handler = createCompareHandlerWithDocumentProvider(
            documentProvider,
            new OpenSchemaRegistryVersionCommandHandler(new SchemaRegistryDocumentProvider())
        );

        const originalShowQuickPick = vscode.window.showQuickPick;
        const originalExecuteCommand = vscode.commands.executeCommand;

        const pickedLabels = ["v1", "v3"];
        let quickPickIndex = 0;
        const executeCalls: unknown[][] = [];

        try {
            (vscode.window as any).showQuickPick = async (items: any[]) => {
                const wanted = pickedLabels[quickPickIndex++];
                return items.find(item => item.label === wanted);
            };
            (vscode.commands as any).executeCommand = async (...args: unknown[]) => {
                executeCalls.push(args);
                return undefined;
            };

            await handler.execute(versionNode);

            assert.strictEqual(executeCalls.length, 1);
            assert.strictEqual(executeCalls[0][0], "vscode.diff");
            assert.strictEqual((executeCalls[0][1] as vscode.Uri).scheme, "kafka-schema");
            assert.strictEqual((executeCalls[0][2] as vscode.Uri).scheme, "kafka-schema");
            assert.strictEqual(executeCalls[0][3], "orders-value: v1 ↔ v3");
            assert.ok(documentProvider.provideTextDocumentContent(executeCalls[0][1] as vscode.Uri).includes("# Version: 1"));
            assert.ok(documentProvider.provideTextDocumentContent(executeCalls[0][2] as vscode.Uri).includes("# Version: 3"));
        } finally {
            (vscode.window as any).showQuickPick = originalShowQuickPick;
            (vscode.commands as any).executeCommand = originalExecuteCommand;
        }
    });

    test("tryOpen shows mapped error message when open fails", async () => {
        const originalShowErrorMessage = vscode.window.showErrorMessage;
        let errorMessage: string | undefined;

        try {
            (vscode.window as any).showErrorMessage = async (message: string) => {
                errorMessage = message;
                return undefined;
            };

            const handler = createCompareHandlerWithDocumentProvider(
                new SchemaRegistryDocumentProvider(),
                {
                    execute: async () => {
                        throw new Error("open failed");
                    }
                } as unknown as OpenSchemaRegistryVersionCommandHandler
            );
            await handler.tryOpen({} as any);

            assert.strictEqual(errorMessage, "open failed");
        } finally {
            (vscode.window as any).showErrorMessage = originalShowErrorMessage;
        }
    });
});

function createCompareHandlerWithDocumentProvider(
    documentProvider: SchemaRegistryDocumentProvider,
    openVersionCommand: OpenSchemaRegistryVersionCommandHandler
): CompareSchemaRegistryVersionsCommandHandler {
    return new CompareSchemaRegistryVersionsCommandHandler(documentProvider, openVersionCommand);
}

function createProvider(details: SchemaVersionDetail[]): SchemaRegistryProvider {
    const versions = details.map(detail => detail.version).sort((left, right) => left - right);
    const byVersion = new Map<number, SchemaVersionDetail>(details.map(detail => [detail.version, detail]));
    const subject = details[0]?.subject || "subject";

    return {
        listSubjects: async () => [{ name: subject }],
        listSubjectVersions: async () => versions.map(version => ({ subject, version })),
        getSchemaVersion: async (_registryRef, _subject, version) => {
            if (version === "latest") {
                return byVersion.get(versions[versions.length - 1]) as SchemaVersionDetail;
            }
            const detail = byVersion.get(version);
            if (!detail) {
                throw new Error(`Missing version ${version}`);
            }
            return detail;
        }
    };
}

function createDetail(subject: string, version: number, schemaType: "AVRO" | "JSON" | "PROTOBUF"): SchemaVersionDetail {
    return {
        subject,
        version,
        schemaType,
        schema: `{"type":"record","name":"v${version}"}`,
        id: version,
        references: []
    };
}
