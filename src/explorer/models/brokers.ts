import * as vscode from "vscode";

import { Broker, Client } from "../../client";
import { Icons } from "../../constants";
import { ConfigsItem, ExplorerContext } from "./common";
import { NodeBase } from "./nodeBase";

export class BrokerGroupItem extends NodeBase {
    public contextValue = "brokers";
    public label = "Brokers";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client, public clusterContext: ExplorerContext) {
        super();
    }

    public async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const brokers = await this.client.getBrokers();
        return brokers.map((broker) => {
            return new BrokerItem(this.client, broker);
        });
    }
}

export class BrokerItem extends NodeBase {
    public contextValue = "broker";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client, public broker: Broker) {
        super();
        this.label = `${broker.id} (${broker.host}:${broker.port})`;

        if (broker.isController) {
            this.description = "Controller";
        }

        this.iconPath = Icons.Server;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configNode = new ConfigsItem(() => this.client.getBrokerConfigs(this.broker.id));
        return Promise.resolve([configNode]);
    }
}
