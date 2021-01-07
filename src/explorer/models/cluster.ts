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
