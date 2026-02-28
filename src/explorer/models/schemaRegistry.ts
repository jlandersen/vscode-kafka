import * as vscode from "vscode";

import { ClusterItem } from "./cluster";
import { ErrorItem, InformationItem } from "./common";
import { NodeBase } from "./nodeBase";
import { TopicItem } from "./topics";
import { ClusterSettings, SchemaRegistrySettings } from "../../settings";
import {
    DefaultSchemaRegistryProviderFactory,
    getSchemaRegistryErrorMessage,
    SchemaRegistry,
    SchemaRegistryProvider,
    SchemaRegistryProviderFactory,
    SchemaRegistryRef,
    SchemaVersionDetail,
    SubjectSummary,
    VersionSummary
} from "../../schema-registry";

const TOPIC_NAME_STRATEGY = "TopicNameStrategy";
const RECORD_NAME_STRATEGY = "RecordNameStrategy";
const TOPIC_RECORD_NAME_STRATEGY = "TopicRecordNameStrategy";
const SCHEMA_REGISTRY_SETTINGS_QUERY = "kafka.schemaRegistries";
const RECORD_NAME_STRATEGY_AMBIGUOUS_MESSAGE = "Ambiguous subject discovery for RecordNameStrategy";

interface TopicSubjectDiscovery {
    subjects: SubjectSummary[];
    infoMessage?: string;
}

interface TopicSubjectDiscoveryNodes {
    subjects: SchemaSubjectNode[];
    infoMessage?: string;
}

export class SchemaRegistryErrorItem extends ErrorItem {
    public contextValue = "schemaregistryerror";

    constructor(
        message: string,
        parent: NodeBase,
        public readonly refreshTarget: NodeBase,
        public readonly settingsQuery: string = SCHEMA_REGISTRY_SETTINGS_QUERY
    ) {
        super(message, parent);
    }

    public getTreeItem(): vscode.TreeItem {
        const item = super.getTreeItem();
        item.command = {
            command: "vscode-kafka.schemaRegistry.retry",
            title: "Retry Schema Registry",
            arguments: [this]
        };
        return item;
    }
}

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

export class SchemaRegistryConnectionsItem extends NodeBase {
    public label = "Schema Registries";
    public contextValue = "schemaregistriesroot";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly clusterSettings: ClusterSettings,
        parent: NodeBase
    ) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            return [new InformationItem("No schema registries configured", this)];
        }

        return schemaRegistries.map(schemaRegistry => new SchemaRegistryConnectionNode(
            schemaRegistry,
            this.clusterSettings,
            this
        ));
    }
}

export class SchemaRegistryConnectionNode extends NodeBase {
    public contextValue = "schemaregistryconnection";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(
        public readonly schemaRegistry: SchemaRegistry,
        private readonly clusterSettings: ClusterSettings,
        parent: NodeBase
    ) {
        super(parent);
        this.label = schemaRegistry.name;
        this.description = schemaRegistry.connection.url;
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const linkedClusterCount = this.clusterSettings.getAll()
            .filter(cluster => cluster.schemaRegistryId === this.schemaRegistry.id)
            .length;

        if (linkedClusterCount === 0) {
            return [new InformationItem("Not linked to any clusters", this)];
        }

        return [new InformationItem(`Linked to ${linkedClusterCount} cluster(s)`, this)];
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
            return [createSchemaRegistryErrorItem("Failed to load subjects", error, this)];
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
            return [createSchemaRegistryErrorItem("Failed to load versions", error, this)];
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
    private static readonly subjectListCacheMaxEntries = 32;
    private static readonly subjectListCache = new WeakMap<SchemaRegistryProvider, Map<string, Promise<SubjectSummary[]>>>();
    private discovery: TopicSubjectDiscoveryNodes | undefined;

    constructor(private readonly topicItem: TopicItem, private readonly factory: SchemaRegistryProviderFactory = new DefaultSchemaRegistryProviderFactory()) {
        super(topicItem);
    }

    public async hasDiscoverableSubjects(): Promise<boolean> {
        const discovery = await this.getDiscovery();
        return discovery.subjects.length > 0 || Boolean(discovery.infoMessage);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        try {
            const discovery = await this.getDiscovery();
            if (discovery.subjects.length === 0) {
                if (discovery.infoMessage) {
                    return [new InformationItem(discovery.infoMessage, this)];
                }
                return [new InformationItem("No discoverable subjects", this)];
            }
            return discovery.subjects;
        } catch (error) {
            return [createSchemaRegistryErrorItem("Failed to discover subjects", error, this)];
        }
    }

    private async getDiscovery(): Promise<TopicSubjectDiscoveryNodes> {
        if (this.discovery) {
            return this.discovery;
        }

        const cluster = this.topicItem.getParent().getParent().cluster;
        const registryRef = await this.factory.getRegistryRef(cluster);
        const provider = this.factory.getProvider(registryRef);
        if (!registryRef || !provider) {
            this.discovery = { subjects: [] };
            return this.discovery;
        }

        const namingStrategy = registryRef.connection.namingStrategy || TOPIC_NAME_STRATEGY;
        const allSubjects = await TopicSchemaSubjectsItem.getCachedSubjects(registryRef, provider);
        const discoveredSubjects = discoverSubjects(allSubjects, this.topicItem.topic.id, namingStrategy);
        const subjectNodes = discoveredSubjects.subjects
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(subject => new SchemaSubjectNode(registryRef, subject, provider, this));

        this.discovery = {
            subjects: subjectNodes,
            infoMessage: discoveredSubjects.infoMessage
        };
        return this.discovery;
    }

    public clearChildrenCache(): void {
        this.discovery = undefined;
        super.clearChildrenCache();
    }

    private static async getCachedSubjects(registryRef: SchemaRegistryRef, provider: SchemaRegistryProvider): Promise<SubjectSummary[]> {
        const cacheKey = `${registryRef.id}|${registryRef.connection.url}|${registryRef.connection.namingStrategy || TOPIC_NAME_STRATEGY}`;
        let providerCache = this.subjectListCache.get(provider);
        if (!providerCache) {
            providerCache = new Map<string, Promise<SubjectSummary[]>>();
            this.subjectListCache.set(provider, providerCache);
        }

        const cachedSubjects = providerCache.get(cacheKey);
        if (cachedSubjects) {
            providerCache.delete(cacheKey);
            providerCache.set(cacheKey, cachedSubjects);
            return cachedSubjects;
        }

        const subjectListPromise = provider.listSubjects(registryRef).catch(error => {
            providerCache.delete(cacheKey);
            throw error;
        });
        providerCache.set(cacheKey, subjectListPromise);

        if (providerCache.size > this.subjectListCacheMaxEntries) {
            const oldestKey = providerCache.keys().next().value;
            if (oldestKey) {
                providerCache.delete(oldestKey);
            }
        }

        return subjectListPromise;
    }
}

const discoverSubjects = (allSubjects: SubjectSummary[], topicName: string, namingStrategy: string): TopicSubjectDiscovery => {
    switch (namingStrategy) {
    case TOPIC_NAME_STRATEGY: {
        const candidates = new Set<string>([
            `${topicName}-key`,
            `${topicName}-value`
        ]);
        return { subjects: allSubjects.filter(subject => candidates.has(subject.name)) };
    }
    case TOPIC_RECORD_NAME_STRATEGY: {
        const prefix = `${topicName}-`;
        return { subjects: allSubjects.filter(subject => subject.name.startsWith(prefix) && subject.name.length > prefix.length) };
    }
    case RECORD_NAME_STRATEGY: {
        const topicPattern = new RegExp(`(^|[._-])${escapeRegExp(topicName)}([._-]|$)`, "i");
        const heuristicMatches = allSubjects.filter(subject => topicPattern.test(subject.name));
        if (heuristicMatches.length > 1) {
            return {
                subjects: [],
                infoMessage: RECORD_NAME_STRATEGY_AMBIGUOUS_MESSAGE
            };
        }
        return { subjects: heuristicMatches };
    }
    default:
        return { subjects: [] };
    }
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createSchemaRegistryErrorItem = (prefix: string, error: unknown, refreshTarget: NodeBase): SchemaRegistryErrorItem =>
    new SchemaRegistryErrorItem(`${prefix}: ${getSchemaRegistryErrorMessage(error)}`, refreshTarget, refreshTarget);
