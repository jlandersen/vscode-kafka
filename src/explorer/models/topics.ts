import * as vscode from "vscode";

import { Client, Topic, TopicPartition } from "../../client";
import { icons } from "../../constants";
import { ConfigsItem, NodeBase } from "./nodeBase";

export class TopicGroupItem implements NodeBase {
    public readonly contextValue = "topics";
    public readonly label = "Topics";
    public iconPath?: string;

    constructor(private client: Client) {
    }

    public getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getTopics().map((topic) => {
            return new TopicItem(this.client, topic);
        }));
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: this.iconPath,
        };
    }
}

export class TopicItem implements NodeBase {
    public label: string;
    public description: string;
    public readonly contextValue = "topic";

    constructor(private client: Client, private topic: Topic) {
        this.label = topic.id;
        this.description = `Partitions: ${topic.partitionCount}, Replicas: ${topic.replicationFactor}`;
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configNode = new ConfigsItem("topicconfigs", () => this.client.getTopicConfigs(this.topic.id));
        const partitionNodes = Object.keys(this.topic.partitions).map((partition) => {
            return new TopicPartitionItem(this.topic.partitions[partition]);
        });
        return Promise.resolve([configNode, ...partitionNodes]);
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: icons.topic,
        };
    }
}

export class TopicPartitionItem implements NodeBase {
    public label: string;
    public description: string;
    public isrStatus: "in-sync" | "not-in-sync";
    public readonly contextValue = "topicpartition";

    constructor(partition: TopicPartition) {
        this.label = `Partition: ${partition.partition}`;

        if (partition.isr.length === partition.replicas.length) {
            this.isrStatus = "in-sync";
        } else {
            this.isrStatus = "not-in-sync";
        }

        this.description = `Leader: ${partition.leader}, ISR: ${this.isrStatus}`;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        };
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}
