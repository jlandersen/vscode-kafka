import * as vscode from "vscode";

import { Broker, Client } from "../../client";
import { icons } from "../../constants";
import { ConfigsItem } from "./common";
import { NodeBase } from "./nodeBase";

export class BrokerGroupItem extends NodeBase {
    public contextValue = "brokers";
    public label = "Brokers";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client) {
        super();
    }

    public getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getBrokers().map((broker) => {
            return new BrokerItem(this.client, broker);
        }));
    }
}

export class BrokerItem extends NodeBase {
    public contextValue = "broker";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private client: Client, private broker: Broker) {
        super();
        this.label = `${broker.id} (${broker.host}:${broker.port})`;

        if (broker.isController) {
            this.description = "Controller";
        }

        this.iconPath = this.broker.isConnected ? icons.serverConnected : icons.server;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configNode = new ConfigsItem(() => this.client.getBrokerConfigs(this.broker.id));
        return Promise.resolve([configNode]);
    }
}
