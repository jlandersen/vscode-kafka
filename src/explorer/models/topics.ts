import * as vscode from "vscode";

import { Client, Topic, TopicPartition } from "../../client";
import { icons } from "../../constants";
import { ConfigsItem } from "./common";
import { NodeBase } from "./nodeBase";

export class TopicGroupItem extends NodeBase {
    public label = "Topics";
    public contextValue = "topics";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client) {
        super();
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getTopics().map((topic) => {
            return new TopicItem(this.client, topic);
        }));
    }
}

export class TopicItem extends NodeBase {
    public contextValue = "topic";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    public iconPath = icons.topic;

    constructor(private client: Client, private topic: Topic) {
        super();
        this.label = topic.id;
        this.description = `Partitions: ${topic.partitionCount}, Replicas: ${topic.replicationFactor}`;
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configNode = new ConfigsItem(() => this.client.getTopicConfigs(this.topic.id));
        const partitionNodes = Object.keys(this.topic.partitions).map((partition) => {
            return new TopicPartitionItem(this.topic.partitions[partition]);
        });
        return Promise.resolve([configNode, ...partitionNodes]);
    }
}

export class TopicPartitionItem extends NodeBase {
    public contextValue = "topicpartition";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    public isrStatus: "in-sync" | "not-in-sync";

    constructor(partition: TopicPartition) {
        super();
        this.label = `Partition: ${partition.partition}`;

        if (partition.isr.length === partition.replicas.length) {
            this.isrStatus = "in-sync";
        } else {
            this.isrStatus = "not-in-sync";
        }

        this.description = `Leader: ${partition.leader}, ISR: ${this.isrStatus}`;
    }
}
