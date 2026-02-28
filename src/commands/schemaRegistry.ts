import * as vscode from "vscode";

import { KafkaExplorer } from "../explorer";
import { NodeBase } from "../explorer/models/nodeBase";
import { SchemaRegistryConnectionNode, SchemaRegistryErrorItem, SchemaRegistryNode, SchemaSubjectNode, SchemaVersionNode } from "../explorer/models/schemaRegistry";
import { getSchemaRegistryErrorMessage, SchemaRegistryProvider } from "../schema-registry";
import { getSchemaDocumentLanguage, SchemaRegistryDocumentProvider } from "../schema-registry/documentProvider";
import { Cluster } from "../client";
import { ClusterSettings, SchemaRegistrySettings } from "../settings";
import { openSchemaRegistryForm } from "../wizards/schemaRegistries";

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

export class AddSchemaRegistryCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.add";

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly explorer: KafkaExplorer,
        private readonly context: vscode.ExtensionContext
    ) {
    }

    public async execute(): Promise<void> {
        openSchemaRegistryForm(undefined, this.schemaRegistrySettings, this.explorer, this.context);
    }
}

export class EditSchemaRegistryCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.edit";

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly explorer: KafkaExplorer,
        private readonly context: vscode.ExtensionContext
    ) {
    }

    public async execute(item?: SchemaRegistryConnectionNode | SchemaRegistryNode): Promise<void> {
        const schemaRegistryId = item ? getSchemaRegistryId(item) : await this.pickSchemaRegistryId();
        if (!schemaRegistryId) {
            return;
        }

        const schemaRegistry = await this.schemaRegistrySettings.getWithCredentials(schemaRegistryId);
        if (!schemaRegistry) {
            vscode.window.showErrorMessage("Schema Registry not found.");
            return;
        }

        openSchemaRegistryForm(schemaRegistry, this.schemaRegistrySettings, this.explorer, this.context);
    }

    private async pickSchemaRegistryId(): Promise<string | undefined> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            vscode.window.showInformationMessage("No schema registries configured.");
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            schemaRegistries.map(schemaRegistry => ({
                label: schemaRegistry.name,
                description: schemaRegistry.connection.url,
                schemaRegistryId: schemaRegistry.id
            })),
            { placeHolder: "Select schema registry to edit" }
        );

        return picked?.schemaRegistryId;
    }
}

export class DeleteSchemaRegistryCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.delete";

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly clusterSettings: ClusterSettings,
        private readonly explorer: KafkaExplorer
    ) {
    }

    public async execute(item?: SchemaRegistryConnectionNode | SchemaRegistryNode): Promise<void> {
        const schemaRegistryId = item ? getSchemaRegistryId(item) : await this.pickSchemaRegistryId();
        if (!schemaRegistryId) {
            return;
        }

        const schemaRegistry = this.schemaRegistrySettings.get(schemaRegistryId);
        if (!schemaRegistry) {
            vscode.window.showErrorMessage("Schema Registry not found.");
            return;
        }

        const linkedClusters = this.clusterSettings.getAll().filter(cluster => cluster.schemaRegistryId === schemaRegistry.id);
        const confirmationMessage = linkedClusters.length > 0
            ? `Delete schema registry '${schemaRegistry.name}' and unlink ${linkedClusters.length} cluster(s)?`
            : `Delete schema registry '${schemaRegistry.name}'?`;
        const confirmation = await vscode.window.showWarningMessage(confirmationMessage, "Cancel", "Delete");
        if (confirmation !== "Delete") {
            return;
        }

        await Promise.all(linkedClusters.map(cluster => this.unlinkCluster(cluster)));
        await this.schemaRegistrySettings.remove(schemaRegistry.id);
        this.explorer.refresh();

        const resultMessage = linkedClusters.length > 0
            ? `Schema Registry '${schemaRegistry.name}' deleted and ${linkedClusters.length} cluster(s) unlinked.`
            : `Schema Registry '${schemaRegistry.name}' deleted.`;
        vscode.window.showInformationMessage(resultMessage);
    }

    private async pickSchemaRegistryId(): Promise<string | undefined> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            vscode.window.showInformationMessage("No schema registries configured.");
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            schemaRegistries.map(schemaRegistry => ({
                label: schemaRegistry.name,
                description: schemaRegistry.connection.url,
                schemaRegistryId: schemaRegistry.id
            })),
            { placeHolder: "Select schema registry to delete" }
        );

        return picked?.schemaRegistryId;
    }

    private async unlinkCluster(cluster: Cluster): Promise<void> {
        const clusterWithCredentials = await this.clusterSettings.getWithCredentials(cluster.id);
        if (!clusterWithCredentials) {
            return;
        }

        await this.clusterSettings.upsert({
            ...clusterWithCredentials,
            schemaRegistryId: undefined
        });
    }
}

export class LinkSchemaRegistryClusterCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.linkCluster";

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly clusterSettings: ClusterSettings,
        private readonly explorer: KafkaExplorer
    ) {
    }

    public async execute(item?: SchemaRegistryConnectionNode | SchemaRegistryNode): Promise<void> {
        const schemaRegistryId = item ? getSchemaRegistryId(item) : await this.pickSchemaRegistryId();
        if (!schemaRegistryId) {
            return;
        }

        const schemaRegistry = this.schemaRegistrySettings.get(schemaRegistryId);
        if (!schemaRegistry) {
            vscode.window.showErrorMessage("Schema Registry not found.");
            return;
        }

        const clusters = this.clusterSettings.getAll().filter(cluster => cluster.schemaRegistryId !== schemaRegistry.id);
        if (clusters.length === 0) {
            vscode.window.showInformationMessage("No clusters available to link.");
            return;
        }

        const pickedCluster = await vscode.window.showQuickPick(
            clusters.map(cluster => ({
                label: cluster.name,
                description: cluster.bootstrap,
                clusterId: cluster.id
            })),
            { placeHolder: `Select cluster to link with '${schemaRegistry.name}'` }
        );
        if (!pickedCluster) {
            return;
        }

        const clusterWithCredentials = await this.clusterSettings.getWithCredentials(pickedCluster.clusterId);
        if (!clusterWithCredentials) {
            vscode.window.showErrorMessage("Cluster not found.");
            return;
        }

        await this.clusterSettings.upsert({
            ...clusterWithCredentials,
            schemaRegistryId: schemaRegistry.id
        });
        this.explorer.refresh();
        vscode.window.showInformationMessage(`Linked cluster '${clusterWithCredentials.name}' to '${schemaRegistry.name}'.`);
    }

    private async pickSchemaRegistryId(): Promise<string | undefined> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            vscode.window.showInformationMessage("No schema registries configured.");
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            schemaRegistries.map(schemaRegistry => ({
                label: schemaRegistry.name,
                description: schemaRegistry.connection.url,
                schemaRegistryId: schemaRegistry.id
            })),
            { placeHolder: "Select schema registry to link" }
        );

        return picked?.schemaRegistryId;
    }
}

export class UnlinkSchemaRegistryClusterCommandHandler {
    public static readonly commandId = "vscode-kafka.schemaRegistry.unlinkCluster";

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly clusterSettings: ClusterSettings,
        private readonly explorer: KafkaExplorer
    ) {
    }

    public async execute(item?: SchemaRegistryConnectionNode | SchemaRegistryNode): Promise<void> {
        const schemaRegistryId = item ? getSchemaRegistryId(item) : await this.pickSchemaRegistryId();
        if (!schemaRegistryId) {
            return;
        }

        const schemaRegistry = this.schemaRegistrySettings.get(schemaRegistryId);
        if (!schemaRegistry) {
            vscode.window.showErrorMessage("Schema Registry not found.");
            return;
        }

        const linkedClusters = this.clusterSettings.getAll().filter(cluster => cluster.schemaRegistryId === schemaRegistry.id);
        if (linkedClusters.length === 0) {
            vscode.window.showInformationMessage(`No clusters are linked to '${schemaRegistry.name}'.`);
            return;
        }

        const pickedCluster = await vscode.window.showQuickPick(
            linkedClusters.map(cluster => ({
                label: cluster.name,
                description: cluster.bootstrap,
                clusterId: cluster.id
            })),
            { placeHolder: `Select cluster to unlink from '${schemaRegistry.name}'` }
        );
        if (!pickedCluster) {
            return;
        }

        const clusterWithCredentials = await this.clusterSettings.getWithCredentials(pickedCluster.clusterId);
        if (!clusterWithCredentials) {
            vscode.window.showErrorMessage("Cluster not found.");
            return;
        }

        await this.clusterSettings.upsert({
            ...clusterWithCredentials,
            schemaRegistryId: undefined
        });
        this.explorer.refresh();
        vscode.window.showInformationMessage(`Unlinked cluster '${clusterWithCredentials.name}' from '${schemaRegistry.name}'.`);
    }

    private async pickSchemaRegistryId(): Promise<string | undefined> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            vscode.window.showInformationMessage("No schema registries configured.");
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            schemaRegistries.map(schemaRegistry => ({
                label: schemaRegistry.name,
                description: schemaRegistry.connection.url,
                schemaRegistryId: schemaRegistry.id
            })),
            { placeHolder: "Select schema registry to unlink" }
        );

        return picked?.schemaRegistryId;
    }
}

export type SchemaRegistryCommandHandler =
    | AddSchemaRegistryCommandHandler
    | EditSchemaRegistryCommandHandler
    | DeleteSchemaRegistryCommandHandler
    | LinkSchemaRegistryClusterCommandHandler
    | UnlinkSchemaRegistryClusterCommandHandler
    | RefreshSchemaRegistryCommandHandler
    | RetrySchemaRegistryCommandHandler
    | OpenSchemaRegistrySettingsCommandHandler
    | OpenSchemaRegistryVersionCommandHandler
    | CompareSchemaRegistryVersionsCommandHandler;

const getSchemaRegistryId = (item: SchemaRegistryConnectionNode | SchemaRegistryNode): string => {
    if (item instanceof SchemaRegistryConnectionNode) {
        return item.schemaRegistry.id;
    }
    return item.registryRef.id;
};

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
