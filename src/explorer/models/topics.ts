import * as vscode from "vscode";

import { Topic, TopicPartition } from "../../client";
import { Icons } from "../../constants";
import { getWorkspaceSettings } from "../../settings";
import { TopicSortOption } from "../../settings/workspace";
import { ClusterItem } from "./cluster";
import { ConfigsItem } from "./common";
import { NodeBase } from "./nodeBase";
import * as minimatch from "minimatch";

export class TopicGroupItem extends NodeBase {
    public label = "Topics";
    public contextValue = "topics";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const client = this.getParent().client;
        const settings = getWorkspaceSettings();
        let topics = await client.getTopics();
        //Filter topics before sorting them
        topics = topics.filter(t => this.isDisplayed(t, settings.topicFilters));

        switch (settings.topicSortOption) {
            case TopicSortOption.name:
                topics = topics.sort(this.sortByNameAscending);
                break;
            case TopicSortOption.partitions:
                topics = topics.sort(this.sortByPartitionsAscending);
                break;
        }
        return topics.map((topic) => {
            return new TopicItem(topic, this);
        });
    }
    getParent(): ClusterItem {
        return <ClusterItem>super.getParent();
    }

    private sortByNameAscending(a: Topic, b: Topic): -1 | 0 | 1 {
        if (a.id.toLowerCase() < b.id.toLowerCase()) { return -1; }
        if (a.id.toLowerCase() > b.id.toLowerCase()) { return 1; }
        return 0;
    }

    private sortByPartitionsAscending(a: Topic, b: Topic): -1 | 0 | 1 {
        if (a.partitionCount < b.partitionCount) { return -1; }
        if (a.partitionCount > b.partitionCount) { return 1; }
        return 0;
    }

    private isDisplayed(t: Topic, filters: string[]): boolean {
        if (!filters) {
            return true;
        }
        const id = t.id.toLowerCase();
        return !filters.find(f => minimatch(id, f));
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
        const client = this.getParent().getParent().client;
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
