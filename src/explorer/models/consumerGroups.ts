import * as vscode from "vscode";

import { Client } from "../../client";
import { icons } from "../../constants";
import { NodeBase } from "./nodeBase";

export class ConsumerGroupsItem implements NodeBase {
    public label = "Consumer Groups";
    public readonly contextValue = "consumergroups";

    constructor(private client: Client) {
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        };
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const consumerGroupIds = await this.client.getConsumerGroupIds();
        return Promise.resolve(consumerGroupIds.map((consumerGroupId) => (new ConsumerGroupItem(consumerGroupId))));
    }
}

export class ConsumerGroupItem implements NodeBase {
    public label: string;
    public readonly contextValue = "consumergroupitem";

    constructor(consumerGroupId: string) {
        this.label = consumerGroupId;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: icons.group,
        };
    }
    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}
