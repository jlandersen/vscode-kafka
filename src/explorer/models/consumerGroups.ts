import * as vscode from "vscode";

import { Client, ConsumerGroupMember } from "../../client";
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
        return Promise.resolve(
            consumerGroupIds.map((consumerGroupId) => (new ConsumerGroupItem(this.client, consumerGroupId))));
    }
}

class ConsumerGroupItem implements NodeBase {
    public label: string;
    public readonly contextValue = "consumergroupitem";

    constructor(private client: Client, private consumerGroupId: string) {
        this.label = consumerGroupId;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: icons.group,
        };
    }
    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const groupDetails = await this.client.getConsumerGroupDetails(this.consumerGroupId);
        return Promise.resolve([
            new ConsumerGroupDetailsItem("State", groupDetails.state),
            new ConsumerGroupMembersItem(groupDetails.members),
        ]);
    }
}

class ConsumerGroupDetailsItem implements NodeBase {
    public readonly contextValue = "consumergroupdetailsitem";

    constructor(public label: string, public description: string) {
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        };
    }
    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}

class ConsumerGroupMembersItem implements NodeBase {
    public label = "Members";
    public readonly contextValue = "consumergroupmembersitems";

    constructor(private members: ConsumerGroupMember[]) {
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        };
    }
    getChildren(element: NodeBase): Promise<NodeBase[]> {
        const members = this.members.map((member) => (new ConsumerGroupMemberItem(member)));
        return Promise.resolve(members);
    }
}

class ConsumerGroupMemberItem implements NodeBase {
    public label: string;
    public description: string;
    public readonly contextValue = "consumergroupmemberitem";

    constructor(member: ConsumerGroupMember) {
        this.label = `${member.clientId} (${member.clientHost})`;
        this.description = member.memberId;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        };
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}
