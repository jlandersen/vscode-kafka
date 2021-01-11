import * as vscode from "vscode";

import { Cluster, Client } from "../../client";
import { NodeBase } from "./nodeBase";
import { BrokerGroupItem } from "./brokers";
import { TopicGroupItem, TopicItem } from "./topics";

import { ConsumerGroupsItem } from "./consumerGroups";
import { KafkaModel } from "./kafka";
import { Disposable } from "vscode";

const TOPIC_INDEX = 1;

export class ClusterItem extends NodeBase implements Disposable {
    public contextValue = "cluster";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(public client: Client, public cluster: Cluster, parent: KafkaModel) {
        super(parent);
        this.label = cluster.name;
        this.description = cluster.bootstrap;
    }

    async computeChildren(): Promise<NodeBase[]> {
        return [
            new BrokerGroupItem(this),
            new TopicGroupItem(this),
            new ConsumerGroupsItem(this)];
    }

    getParent(): KafkaModel {
        return <KafkaModel>super.getParent();
    }

    public dispose(): void {
        this.client.dispose();
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

/**
 * A node displayed when there are no clusters, allowing to create a new one.
 */
export class NoClusterItem extends NodeBase {
    public contextValue = "nocluster";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(parent: NodeBase) {
        super(parent);
        this.label = 'Click here to add a cluster';
    }
    getTreeItem():vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            description: this.description,
            command : {
                title: 'Add a cluster',
                command:"vscode-kafka.explorer.addcluster"
            }
        }
    }
}
