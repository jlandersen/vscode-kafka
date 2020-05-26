import * as vscode from "vscode";

import { ConsumerGroupMember, Client } from "../../client";
import { Icons } from "../../constants";
import { NodeBase } from "./nodeBase";
import { ExplorerContext } from "./common";

export class ConsumerGroupsItem extends NodeBase {
    public label = "Consumer Groups";
    public contextValue = "consumergroups";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client, public context: ExplorerContext) {
        super();
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const consumerGroupIds = await this.client.getConsumerGroupIds();
        return Promise.resolve(
            consumerGroupIds.map((consumerGroupId) => (new ConsumerGroupItem(this.client, consumerGroupId))));
    }
}

class ConsumerGroupItem extends NodeBase {
    public contextValue = "consumergroupitem";
    public iconPath = Icons.Group;
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client, private consumerGroupId: string) {
        super();
        this.label = consumerGroupId;
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const groupDetails = await this.client.getConsumerGroupDetails(this.consumerGroupId);
        return [
            new ConsumerGroupDetailsItem("State", groupDetails.state),
            new ConsumerGroupMembersItem(groupDetails.members),
        ];
    }
}

class ConsumerGroupDetailsItem extends NodeBase {
    public contextValue = "consumergroupdetailsitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    constructor(public label: string, description: string) {
        super();
        this.label = label;
        this.description = description;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}

class ConsumerGroupMembersItem extends NodeBase {
    public label = "Members";
    public contextValue = "consumergroupmembersitems";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private members: ConsumerGroupMember[]) {
        super();
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        const members = this.members.map((member) => (new ConsumerGroupMemberItem(member)));
        return Promise.resolve(members);
    }
}

class ConsumerGroupMemberItem extends NodeBase {
    public contextValue = "consumergroupmemberitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(member: ConsumerGroupMember) {
        super();
        this.label = `${member.clientId} (${member.clientHost})`;
        this.description = member.memberId;
    }
}
