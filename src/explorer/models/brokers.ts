import * as vscode from "vscode";

import { Broker } from "../../client";
import { Icons } from "../../constants";
import { ClusterItem } from "./cluster";
import { ConfigsItem } from "./common";
import { NodeBase } from "./nodeBase";

export class BrokerGroupItem extends NodeBase {
    public contextValue = "brokers";
    public label = "Brokers";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const client = this.getParent().client;
        const brokers = await client.getBrokers();
        return brokers.map((broker) => {
            return new BrokerItem(broker, this);
        });
    }
    getParent(): ClusterItem {
        return <ClusterItem>super.getParent();
    }
}

export class BrokerItem extends NodeBase {
    public contextValue = "broker";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(public broker: Broker, public brokerItem: BrokerGroupItem) {
        super(brokerItem);
        this.label = `${broker.id} (${broker.host}:${broker.port})`;

        if (broker.isController) {
            this.description = "Controller";
        }

        this.iconPath = Icons.Server;
    }

    computeChildren(): Promise<NodeBase[]> {
        const client = this.getParent().getParent().client;
        const configNode = new ConfigsItem(() => client.getBrokerConfigs(this.broker.id), this);
        return Promise.resolve([configNode]);
    }

    getParent(): BrokerGroupItem {
        return <BrokerGroupItem>super.getParent();
    }
}
