import * as vscode from "vscode";

import { Cluster, Client, ClientAccessor } from "../../client";
import { NodeBase } from "./nodeBase";
import { BrokerGroupItem } from "./brokers";
import { TopicGroupItem, TopicItem } from "./topics";

import { ConsumerGroupsItem } from "./consumerGroups";
import { KafkaModel } from "./kafka";
import { Disposable } from "vscode";
import { GlyphChars } from "../../constants";
import { ClusterProvider, defaultClusterProviderId } from "../../kafka-extensions/registry";
import { ClusterSettings } from "../../settings/clusters";

const TOPIC_INDEX = 1;

export class ClusterProviderItem extends NodeBase implements Disposable {

    public contextValue = "clusterProvider";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private clientAccessor: ClientAccessor, public readonly clusterProvider: ClusterProvider, parent: KafkaModel) {
        super(parent);
        this.label = clusterProvider.name;
    }

    async computeChildren(): Promise<NodeBase[]> {
        const clusters = this.getParent().clusterSettings.getAll();
        return clusters
            .filter((c) => c.clusterProviderId === this.clusterProvider.id || (c.clusterProviderId === undefined && this.clusterProvider.id === defaultClusterProviderId))
            .map((c) => {
                return new ClusterItem(this.getParent().clusterSettings, this.clientAccessor, c, this);
            });
    }

    getParent(): KafkaModel {
        return <KafkaModel>super.getParent();
    }

    public dispose(): void {
        this.children?.forEach(child => (<ClusterItem>child).dispose());
    }

}

export class ClusterItem extends NodeBase implements Disposable {
    public contextValue = "cluster";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, public readonly cluster: Cluster, parent: KafkaModel | ClusterProviderItem) {
        super(parent);
        this.label = cluster.name;
        this.description = cluster.bootstrap;
    }

    public get client(): Client {
        return this.clientAccessor.get(this.cluster.id);
    }

    async computeChildren(): Promise<NodeBase[]> {
        return [
            new BrokerGroupItem(this),
            new TopicGroupItem(this),
            new ConsumerGroupsItem(this)];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = super.getTreeItem();
        // to prevent from tree expansion after a refresh, we need to force the id to a static value
        // because we change the label according if cluster is selected or not.
        treeItem.id = this.cluster.name;
        // update label and contextValue (used by contextual menu) according the selection state
        if (this.selected) {
            treeItem.contextValue = 'selectedCluster';
            treeItem.label = GlyphChars.Check + ' ' + treeItem.label;
        } else {
            treeItem.contextValue = 'cluster';
        }
        return treeItem;
    }

    public get selected(): boolean {
        return (this.clusterSettings.selected?.name === this.cluster.name);
    }

    public dispose(): void {
        this.clientAccessor.remove(this.cluster.id);
    }

    async findTopictemByName(topicName: string): Promise<NodeBase | TopicItem | undefined> {
        const topics = (await this.getTopicGroupItem()).getChildren();
        return topics
            .then(t =>
                t.find(child => (<TopicItem>child).topic.id === topicName));
    }

    private async getTopicGroupItem(): Promise<NodeBase> {
        return (await this.getChildren())[TOPIC_INDEX];
    }

}
