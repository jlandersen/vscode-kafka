import * as vscode from "vscode";

import { Client, Topic } from "../../client";
import { icons } from "../../constants";
import { NodeBase } from "./nodeBase";

export class TopicGroupItem implements NodeBase {
    public readonly contextValue = "topics";
    public readonly label = "Topics";
    public iconPath?: string;

    constructor(private client: Client) {
    }

    public getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getTopics().map((topic) => {
            return new TopicItem(topic);
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

    constructor(topic: Topic) {
        this.label = topic.id;
        this.description = `Partitions: ${topic.partitionCount}, Replicas: ${topic.replicationFactor}`;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: icons.topic,
        };
    }
}
