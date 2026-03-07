import * as vscode from "vscode";

import { Cluster, Client, ClientAccessor, ClientState } from "../../client";
import { NodeBase } from "./nodeBase";
import { BrokerGroupItem } from "./brokers";
import { TopicGroupItem, TopicItem } from "./topics";

import { ConsumerGroupsItem } from "./consumerGroups";
import { KafkaModel } from "./kafka";
import { Disposable } from "vscode";
import { GlyphChars } from "../../constants";
import { ErrorItem, getErrorMessage } from "./common";
import { SchemaRegistriesItem } from "./schemaRegistry";

const TOPIC_INDEX = 2;

export class ClusterItem extends NodeBase implements Disposable {
    public contextValue = "cluster";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    private clientState = ClientState.disconnected;
    private connectionError: string | undefined;

    constructor(private clientAccessor: ClientAccessor, public readonly cluster: Cluster, parent: NodeBase) {
        super(parent);
        this.label = cluster.name;
        this.description = cluster.bootstrap;
    }

    public async getClient(): Promise<Client> {
        return await this.clientAccessor.get(this.cluster.id);
    }

    public async refreshConnectionState(): Promise<void> {
        this.clientState = await this.clientAccessor.getState(this.cluster.id);
    }

    public updateConnectionState(state: ClientState): boolean {
        if (this.clientState === state) {
            return false;
        }
        this.clientState = state;
        if (state !== ClientState.invalid) {
            this.connectionError = undefined;
        }
        return true;
    }

    async computeChildren(): Promise<NodeBase[]> {
        await this.refreshConnectionState();
        if (this.clientState !== ClientState.connected) {
            try {
                const client = await this.getClient();
                await client.getBrokers();
            } catch (error) {
                this.connectionError = getErrorMessage(error);
                await this.refreshConnectionState();
                return [new ErrorItem(this.connectionError, this)];
            }
            await this.refreshConnectionState();
        }

        if (this.clientState !== ClientState.connected) {
            return [new ErrorItem(this.connectionError || "Cluster connection failed", this)];
        }

        this.connectionError = undefined;
        return [
            new BrokerGroupItem(this),
            new SchemaRegistriesItem(this),
            new TopicGroupItem(this),
            new ConsumerGroupsItem(this)];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = super.getTreeItem();
        treeItem.iconPath = this.getConnectionIcon();
        if (this.clientState === ClientState.invalid) {
            treeItem.tooltip = this.connectionError || "Cluster connection failed";
        }
        // to prevent from tree expansion after a refresh, we need to force the id to a static value
        // because we change the label according if cluster is selected or not.
        treeItem.id = this.cluster.name;
        // update label and contextValue (used by contextual menu) according the selection state
        let clusterContext: string;
        if (this.selected) {
            clusterContext = 'selectedCluster';
            treeItem.label = GlyphChars.Check + ' ' + treeItem.label;
        } else {
            clusterContext = 'cluster';
        }
        if (this.cluster.clusterProviderId) {
            clusterContext = clusterContext + '-' + this.cluster.clusterProviderId;
        }
        treeItem.contextValue = clusterContext;
        return treeItem;
    }

    private getConnectionIcon(): vscode.ThemeIcon | undefined {
        if (this.clientState === ClientState.connected) {
            return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.green"));
        }
        if (this.clientState === ClientState.invalid) {
            return new vscode.ThemeIcon("warning");
        }
        return undefined;
    }

    public get selected(): boolean {
        return this.getModel()?.clusterSettings.selected?.name === this.cluster.name;
    }

    public dispose(): void {
        this.clientAccessor.remove(this.cluster.id);
    }

    async findTopicItemByName(topicName: string): Promise<NodeBase | TopicItem | undefined> {
        const topics = await this.getTopics();
        return topics.find(child => (<TopicItem>child).topic.id === topicName);
    }

    /**
     * Returns the topic items of the cluster.
     * 
     * @returns the topic items of the cluster.
     */
    async getTopics(): Promise<TopicItem[]> {
        const children = await (await this.getTopicGroupItem()).getChildren();
        return children.map(child => (<TopicItem>child));
    }

    private async getTopicGroupItem(): Promise<NodeBase> {
        return (await this.getChildren())[TOPIC_INDEX];
    }

    private getModel(): KafkaModel | undefined {
        let current: NodeBase | undefined = this;
        while (current) {
            if (current instanceof KafkaModel) {
                return current;
            }
            current = current.getParent();
        }
        return undefined;
    }
}
