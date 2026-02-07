import * as vscode from "vscode";

import { ConsumerGroupMember, ConsumerGroupOffset } from "../../client";
import { Icons } from "../../constants";
import { getWorkspaceSettings } from "../../settings";
import { ErrorItem, getErrorMessage, InformationItem } from "./common";
import { NodeBase } from "./nodeBase";
import { ClusterItem } from "./cluster";
import * as minimatch from "minimatch";

export class ConsumerGroupsItem extends NodeBase {
    public label = "Consumer Groups";
    public contextValue = "consumergroups";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem) {
        super(parent);
    }

    async computeChildren(): Promise<NodeBase[]> {
        try {
            const client = await this.getParent().getClient();
            const settings = getWorkspaceSettings();
            const consumerGroupIds = (await client.getConsumerGroupIds())
                .filter(cg => this.isDisplayed(cg, settings.consumerFilters))
                .sort(this.sortByAscending);
            if (consumerGroupIds.length === 0) {
                return [new InformationItem("No consumer groups", this)];
            }
            return Promise.resolve(
                consumerGroupIds.map((consumerGroupId) => (new ConsumerGroupItem(consumerGroupId, this))));
        } catch (error) {
            return [new ErrorItem(`Failed to load consumer groups: ${getErrorMessage(error)}`, this)];
        }
    }

    private sortByAscending(a: string, b: string): -1 | 0 | 1 {
        if (a.toLowerCase() < b.toLowerCase()) { return -1; }
        if (a.toLowerCase() > b.toLowerCase()) { return 1; }
        return 0;
    }

    getParent(): ClusterItem {
        return <ClusterItem>super.getParent();
    }

    private isDisplayed(consumerGroup: string, filters: string[]): boolean {
        if (!filters) {
            return true;
        }
        const id = consumerGroup.toLowerCase();
        return !filters.find(f => minimatch(id, f));
    }
}

export class ConsumerGroupItem extends NodeBase {
    public contextValue = "consumergroupitem";
    public iconPath = Icons.Group;
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    public readonly clusterId: string;
    constructor(public readonly consumerGroupId: string, parent: ConsumerGroupsItem) {
        super(parent);
        this.label = consumerGroupId;
        this.clusterId = parent.getParent().cluster.id;
    }

    async computeChildren(): Promise<NodeBase[]> {
        try {
            const client = await this.getParent().getParent().getClient();
            const groupDetails = await client.getConsumerGroupDetails(this.consumerGroupId);
            const members = groupDetails.members.sort(this.sortByMemberIdAscending);
            const offsets = groupDetails.offsets.sort(this.sortByTopicAndPartitionAscending);
            return [
                new ConsumerGroupDetailsItem("State", groupDetails.state, this),
                new ConsumerGroupMembersItem(members, this),
                new ConsumerGroupOffsetsItem(offsets, this),
            ];
        } catch (error) {
            return [new ErrorItem(`Failed to load consumer group: ${getErrorMessage(error)}`, this)];
        }
    }

    private sortByMemberIdAscending(a: ConsumerGroupMember, b: ConsumerGroupMember): -1 | 0 | 1 {
        if (a.memberId.toLowerCase() < b.memberId.toLowerCase()) { return -1; }
        if (a.memberId.toLowerCase() > b.memberId.toLowerCase()) { return 1; }
        return 0;
    }

    private sortByTopicAndPartitionAscending(a: ConsumerGroupOffset, b: ConsumerGroupOffset): -1 | 0 | 1 {
        if (a.topic.toLowerCase() < b.topic.toLowerCase()) { return -1; }
        if (a.topic.toLowerCase() > b.topic.toLowerCase()) { return 1; }
        if (a.topic.toLowerCase() === b.topic.toLowerCase()) {
            if (a.partition < b.partition) { return -1; }
            if (a.partition > b.partition) { return 1; }
        }
        return 0;
    }

    getParent(): ConsumerGroupsItem {
        return <ConsumerGroupsItem>super.getParent();
    }
}

class ConsumerGroupDetailsItem extends NodeBase {
    public contextValue = "consumergroupdetailsitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    constructor(public label: string, description: string, parent: ConsumerGroupItem) {
        super(parent);
        this.label = label;
        this.description = description;
    }

    computeChildren(): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}

class ConsumerGroupMembersItem extends NodeBase {
    public label = "Members";
    public contextValue = "consumergroupmembersitems";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private members: ConsumerGroupMember[], parent: ConsumerGroupItem) {
        super(parent);
    }

    computeChildren(): Promise<NodeBase[]> {
        const members = this.members.map((member) => (new ConsumerGroupMemberItem(member, this)));
        return Promise.resolve(members);
    }
}

class ConsumerGroupMemberItem extends NodeBase {
    public contextValue = "consumergroupmemberitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(member: ConsumerGroupMember, parent: ConsumerGroupMembersItem) {
        super(parent);
        this.label = `${member.clientId} (${member.clientHost})`;
        this.description = member.memberId;
    }
}

class ConsumerGroupOffsetsItem extends NodeBase {
    public label = "Offsets";
    public contextValue = "consumergroupoffsetsitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private members: ConsumerGroupOffset[], parent: ConsumerGroupItem) {
        super(parent);
    }

    computeChildren(): Promise<NodeBase[]> {
        const members = this.members.map((member) => (new ConsumerGroupOffsetItem(member, this)));
        return Promise.resolve(members);
    }
}

class ConsumerGroupOffsetItem extends NodeBase {
    public contextValue = "consumergroupoffsetitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(offset: ConsumerGroupOffset, parent: ConsumerGroupOffsetsItem) {
        super(parent);
        this.label = `${offset.topic} (${offset.partition})`;
        this.description = `start:${offset.start} end:${offset.end} offset:${offset.offset} lag:${offset.lag}`;
    }
}
