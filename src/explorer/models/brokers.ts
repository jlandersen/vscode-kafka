import * as vscode from "vscode";

import { Broker } from "../../client";
import { Icons } from "../../constants";
import { ClusterItem } from "./cluster";
import { ConfigsItem, ErrorItem, getErrorMessage } from "./common";
import { NodeBase } from "./nodeBase";

export class BrokerGroupItem extends NodeBase {
    public contextValue = "brokers";
    public label = "Brokers";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(parent: ClusterItem) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        try {
            const client = await this.getParent().getClient();
            const brokers = (await client.getBrokers())
                .sort(this.sortByNameAscending);
            return brokers.map((broker) => {
                return new BrokerItem(broker, this);
            });
        } catch (error) {
            return [new ErrorItem(`Failed to load brokers: ${getErrorMessage(error)}`, this)];
        }
    }
    getParent(): ClusterItem {
        return <ClusterItem>super.getParent();
    }

    private sortByNameAscending(a: Broker, b: Broker): -1 | 0 | 1 {
        if (a.id.toLowerCase() < b.id.toLowerCase()) { return -1; }
        if (a.id.toLowerCase() > b.id.toLowerCase()) { return 1; }
        return 0;
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

    async computeChildren(): Promise<NodeBase[]> {
        try {
            const client = await this.getParent().getParent().getClient();
            const configNode = new ConfigsItem(() => client.getBrokerConfigs(this.broker.id), this);
            return Promise.resolve([configNode]);
        } catch (error) {
            return [new ErrorItem(`Failed to load broker: ${getErrorMessage(error)}`, this)];
        }
    }

    getParent(): BrokerGroupItem {
        return <BrokerGroupItem>super.getParent();
    }
}
