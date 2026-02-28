import * as vscode from "vscode";

import { ClusterItem } from "./cluster";
import { ErrorItem, getErrorMessage, InformationItem } from "./common";
import { NodeBase } from "./nodeBase";
import { TopicItem } from "./topics";
import {
    DefaultSchemaRegistryProviderFactory,
    getSchemaRegistryErrorMessage,
    SchemaRegistryProvider,
    SchemaRegistryProviderFactory,
    SchemaRegistryRef,
    SchemaVersionDetail,
    SubjectSummary,
    VersionSummary
} from "../../schema-registry";

const TOPIC_NAME_STRATEGY = "TopicNameStrategy";

export class SchemaRegistriesItem extends NodeBase {
    public label = "Schema Registries";
    public contextValue = "schemaregistries";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem, private readonly factory: SchemaRegistryProviderFactory = new DefaultSchemaRegistryProviderFactory()) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const cluster = this.getParent().cluster;
        const registryRef = await this.factory.getRegistryRef(cluster);
        const provider = this.factory.getProvider(registryRef);

        if (!registryRef || !provider) {
            return [new InformationItem("Schema Registry not configured", this)];
        }

        return [new SchemaRegistryNode(registryRef, provider, this)];
    }

    public getParent(): ClusterItem {
        return super.getParent() as ClusterItem;
    }
}

export class SchemaRegistryNode extends NodeBase {
    public contextValue = "schemaregistry";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(public readonly registryRef: SchemaRegistryRef, private readonly provider: SchemaRegistryProvider, parent: SchemaRegistriesItem) {
        super(parent);
        this.label = registryRef.name;
        this.description = registryRef.connection.url;
    }

    public async computeChildren(): Promise<NodeBase[]> {
        try {
            const subjects = await this.provider.listSubjects(this.registryRef);
            if (subjects.length === 0) {
                return [new InformationItem("No subjects", this)];
            }

            return subjects
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(subject => new SchemaSubjectNode(this.registryRef, subject, this.provider, this));
        } catch (error) {
            return [new ErrorItem(`Failed to load subjects: ${getSchemaRegistryErrorMessage(error)}`, this)];
        }
    }

    public getParent(): SchemaRegistriesItem {
        return super.getParent() as SchemaRegistriesItem;
    }
}

export class SchemaSubjectNode extends NodeBase {
    public contextValue = "schemasubject";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(
        public readonly registryRef: SchemaRegistryRef,
        public readonly subject: SubjectSummary,
        private readonly provider: SchemaRegistryProvider,
        parent: NodeBase
    ) {
        super(parent);
        this.label = subject.name;
    }

    public async computeChildren(): Promise<NodeBase[]> {
        try {
            const versions = await this.provider.listSubjectVersions(this.registryRef, this.subject.name);
            if (versions.length === 0) {
                return [new InformationItem("No versions", this)];
            }

            return versions
                .sort((a, b) => a.version - b.version)
                .map(version => new SchemaVersionNode(this.registryRef, version, this.provider, this));
        } catch (error) {
            return [new ErrorItem(`Failed to load versions: ${getSchemaRegistryErrorMessage(error)}`, this)];
        }
    }
}

export class SchemaVersionNode extends NodeBase {
    public contextValue = "schemaversion";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(
        public readonly registryRef: SchemaRegistryRef,
        public readonly version: VersionSummary,
        private readonly provider: SchemaRegistryProvider,
        parent: NodeBase
    ) {
        super(parent);
        this.label = `v${version.version}`;
    }

    public async getSchemaVersionDetail(): Promise<SchemaVersionDetail> {
        return this.provider.getSchemaVersion(this.registryRef, this.version.subject, this.version.version);
    }

    public getTreeItem(): vscode.TreeItem {
        const item = super.getTreeItem();
        item.command = {
            command: "vscode-kafka.schemaRegistry.openVersion",
            title: "Open Schema Version",
            arguments: [this]
        };
        return item;
    }
}

export class TopicSchemaSubjectsItem extends NodeBase {
    public label = "Schema Subjects";
    public contextValue = "topicschemas";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    private discoveredSubjects: SchemaSubjectNode[] | undefined;

    constructor(private readonly topicItem: TopicItem, private readonly factory: SchemaRegistryProviderFactory = new DefaultSchemaRegistryProviderFactory()) {
        super(topicItem);
    }

    public async hasDiscoverableSubjects(): Promise<boolean> {
        const subjects = await this.getDiscoveredSubjects();
        return subjects.length > 0;
    }

    public async computeChildren(): Promise<NodeBase[]> {
        try {
            const subjects = await this.getDiscoveredSubjects();
            if (subjects.length === 0) {
                return [new InformationItem("No discoverable subjects", this)];
            }
            return subjects;
        } catch (error) {
            return [new ErrorItem(`Failed to discover subjects: ${getErrorMessage(error)}`, this)];
        }
    }

    private async getDiscoveredSubjects(): Promise<SchemaSubjectNode[]> {
        if (this.discoveredSubjects) {
            return this.discoveredSubjects;
        }

        const cluster = this.topicItem.getParent().getParent().cluster;
        const registryRef = await this.factory.getRegistryRef(cluster);
        const provider = this.factory.getProvider(registryRef);
        if (!registryRef || !provider) {
            this.discoveredSubjects = [];
            return this.discoveredSubjects;
        }

        const namingStrategy = registryRef.connection.namingStrategy || TOPIC_NAME_STRATEGY;
        if (namingStrategy !== TOPIC_NAME_STRATEGY) {
            this.discoveredSubjects = [];
            return this.discoveredSubjects;
        }

        const allSubjects = await provider.listSubjects(registryRef);
        const candidates = new Set<string>([
            `${this.topicItem.topic.id}-key`,
            `${this.topicItem.topic.id}-value`
        ]);

        this.discoveredSubjects = allSubjects
            .filter(subject => candidates.has(subject.name))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(subject => new SchemaSubjectNode(registryRef, subject, provider, this));

        return this.discoveredSubjects;
    }

    public clearChildrenCache(): void {
        this.discoveredSubjects = undefined;
        super.clearChildrenCache();
    }
}
