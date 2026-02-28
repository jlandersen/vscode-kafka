import * as vscode from "vscode";

import { KafkaExplorer } from "../explorer";
import { NodeBase } from "../explorer/models/nodeBase";
import { SchemaRegistryErrorItem, SchemaSubjectNode, SchemaVersionNode } from "../explorer/models/schemaRegistry";
import { getSchemaRegistryErrorMessage, SchemaRegistryProvider } from "../schema-registry";
import { getSchemaDocumentLanguage, SchemaRegistryDocumentProvider } from "../schema-registry/documentProvider";

export class RefreshSchemaRegistryCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.refresh";

    constructor(private readonly explorer: KafkaExplorer) {
    }

    public async execute(item?: NodeBase): Promise<void> {
        this.explorer.refreshItem(item);
    }
}

export class RetrySchemaRegistryCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.retry";

    constructor(private readonly explorer: KafkaExplorer) {
    }

    public async execute(item?: SchemaRegistryErrorItem): Promise<void> {
        this.explorer.refreshItem(item?.refreshTarget ?? item?.getParent());
    }
}

export class OpenSchemaRegistrySettingsCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.openSettings";

    public async execute(item?: SchemaRegistryErrorItem): Promise<void> {
        const query = item?.settingsQuery || "kafka.schemaRegistries";
        await vscode.commands.executeCommand("workbench.action.openSettings", query);
    }
}

export class OpenSchemaRegistryVersionCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.openVersion";

    constructor(private readonly documentProvider: SchemaRegistryDocumentProvider) {
    }

    public async execute(item?: SchemaVersionNode): Promise<void> {
        if (!item) {
            return;
        }

        const detail = await item.getSchemaVersionDetail();
        const language = getSchemaDocumentLanguage(detail.schemaType);
        const uri = this.documentProvider.buildVersionUri(detail.subject, detail.version, language.extension);
        this.documentProvider.setDocumentContent(uri, this.documentProvider.buildDocumentContent(detail));

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(document, language.language);
        await vscode.window.showTextDocument(document, { preview: false });
    }
}

export class CompareSchemaRegistryVersionsCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.compareVersions";

    constructor(
        private readonly documentProvider: SchemaRegistryDocumentProvider,
        private readonly openVersionCommand: OpenSchemaRegistryVersionCommandHandler
    ) {
    }

    public async execute(item?: SchemaSubjectNode | SchemaVersionNode): Promise<void> {
        if (!item) {
            return;
        }

        const subjectNode = item instanceof SchemaVersionNode ? item.getParent() as SchemaSubjectNode : item;
        const versions = await this.getSubjectVersions(subjectNode);
        if (versions.length < 2) {
            vscode.window.showInformationMessage("At least two schema versions are required for compare.");
            return;
        }

        const leftVersion = await this.pickVersion("Select Left Version", versions, item instanceof SchemaVersionNode ? item : undefined);
        if (!leftVersion) {
            return;
        }

        const rightVersion = await this.pickVersion("Select Right Version", versions, leftVersion);
        if (!rightVersion) {
            return;
        }

        const [leftDetail, rightDetail] = await Promise.all([
            leftVersion.getSchemaVersionDetail(),
            rightVersion.getSchemaVersionDetail()
        ]);

        const leftLanguage = getSchemaDocumentLanguage(leftDetail.schemaType);
        const rightLanguage = getSchemaDocumentLanguage(rightDetail.schemaType);

        const leftUri = this.documentProvider.buildVersionUri(leftDetail.subject, leftDetail.version, leftLanguage.extension);
        const rightUri = this.documentProvider.buildVersionUri(rightDetail.subject, rightDetail.version, rightLanguage.extension);

        this.documentProvider.setDocumentContent(leftUri, this.documentProvider.buildDocumentContent(leftDetail));
        this.documentProvider.setDocumentContent(rightUri, this.documentProvider.buildDocumentContent(rightDetail));

        await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${leftDetail.subject}: v${leftDetail.version} ↔ v${rightDetail.version}`
        );
    }

    private async getSubjectVersions(subjectNode: SchemaSubjectNode): Promise<SchemaVersionNode[]> {
        const children = await subjectNode.getChildren();
        return children.filter(child => child instanceof SchemaVersionNode) as SchemaVersionNode[];
    }

    private async pickVersion(
        title: string,
        versions: SchemaVersionNode[],
        preselected?: SchemaVersionNode
    ): Promise<SchemaVersionNode | undefined> {
        const items = versions.map(versionNode => ({
            label: `v${versionNode.version.version}`,
            description: versionNode.version.subject,
            node: versionNode,
            picked: preselected?.version.version === versionNode.version.version
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title,
            placeHolder: "Choose schema version"
        });

        return picked?.node;
    }

    public async tryOpen(item?: SchemaVersionNode): Promise<void> {
        try {
            await this.openVersionCommand.execute(item);
        } catch (error) {
            vscode.window.showErrorMessage(getSchemaRegistryErrorMessage(error));
        }
    }
}

export type SchemaRegistryCommandHandler =
    | RefreshSchemaRegistryCommandHandler
    | RetrySchemaRegistryCommandHandler
    | OpenSchemaRegistrySettingsCommandHandler
    | OpenSchemaRegistryVersionCommandHandler
    | CompareSchemaRegistryVersionsCommandHandler;

export const createSchemaRegistryVersionNodeForTests = (
    provider: SchemaRegistryProvider,
    subject: string,
    version: number
): SchemaVersionNode => {
    const subjectNode = new SchemaSubjectNode(
        {
            id: "registry",
            name: "Schema Registry",
            clusterId: "cluster",
            clusterName: "cluster",
            connection: { url: "http://localhost" }
        },
        { name: subject },
        provider,
        {} as NodeBase
    );

    return new SchemaVersionNode(
        {
            id: "registry",
            name: "Schema Registry",
            clusterId: "cluster",
            clusterName: "cluster",
            connection: { url: "http://localhost" }
        },
        { subject, version },
        provider,
        subjectNode
    );
};
