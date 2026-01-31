import * as vscode from "vscode";

import { isVisible, sortTopics, Topic, TopicPartition } from "../../client";
import { Icons } from "../../constants";
import { ClusterItem } from "./cluster";
import { ConfigsItem } from "./common";
import { NodeBase } from "./nodeBase";

export class TopicGroupItem extends NodeBase {
    public label = "Topics";
    public contextValue = "topics";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const client = await this.getParent().getClient();
        const allTopics = await client.getTopics();
        //Filter topics before sorting them
        let visibleTopics = allTopics.filter(t => isVisible(t));
        visibleTopics = sortTopics(visibleTopics);
        return visibleTopics.map((topic) => {
            return new TopicItem(topic, this);
        });
    }

    getParent(): ClusterItem {
        return <ClusterItem>super.getParent();
    }
}

export class TopicItem extends NodeBase {
    public contextValue = "topic";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    public iconPath = Icons.Topic;
    public readonly clusterId: string;
    public topicId: string;

    constructor(public topic: Topic, parent: TopicGroupItem) {
        super(parent);
        this.clusterId = parent.getParent().cluster.id;
        this.topicId = topic.id;
        this.label = topic.id;
        this.description = `Partitions: ${topic.partitionCount}, Replicas: ${topic.replicationFactor}`;
    }

    async computeChildren(): Promise<NodeBase[]> {
        const client = await this.getParent().getParent().getClient();
        const configNode = new ConfigsItem(() => client.getTopicConfigs(this.topic.id), this);
        const partitionNodes = Object.keys(this.topic.partitions).map((partition) => {
            return new TopicPartitionItem(this.topic.partitions[partition], this);
        });
        return Promise.resolve([configNode, ...partitionNodes]);
    }

    getParent(): TopicGroupItem {
        return <TopicGroupItem>super.getParent();
    }
}

export class TopicPartitionItem extends NodeBase {
    public contextValue = "topicpartition";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    public isrStatus: "in-sync" | "not-in-sync";

    constructor(partition: TopicPartition, parent: TopicItem) {
        super(parent);
        this.label = `Partition: ${partition.partition}`;

        if (partition.isr.length === partition.replicas.length) {
            this.isrStatus = "in-sync";
        } else {
            this.isrStatus = "not-in-sync";
        }

        this.description = `Leader: ${partition.leader}, ISR: ${this.isrStatus}`;
    }
}
