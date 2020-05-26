import * as vscode from "vscode";

import { Cluster, Client } from "../../client";
import { NodeBase } from "./nodeBase";
import { BrokerGroupItem } from "./brokers";
import { TopicGroupItem } from "./topics";

import { ConsumerGroupsItem } from "./consumerGroups";
import { ExplorerContext } from "./common";

export class ClusterItem extends NodeBase {
    public contextValue = "cluster";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    public context: ExplorerContext

    constructor(private client: Client, public cluster: Cluster) {
        super();
        this.label = cluster.name;
        this.description = cluster.bootstrap;
        this.context = new ExplorerContext(cluster.id);
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        return [
            new BrokerGroupItem(this.client, this.context),
            new TopicGroupItem(this.client, this.context),
            new ConsumerGroupsItem(this.client, this.context)];
    }
}
