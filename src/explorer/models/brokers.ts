import * as vscode from "vscode";

import { Broker, Client } from "../../client";
import { icons } from "../../constants";
import { ConfigsItem, NodeBase } from "./nodeBase";

export class BrokerGroupItem implements NodeBase {
    public readonly contextValue = "brokers";
    public readonly label = "Brokers";
    public iconPath?: string;

    constructor(private client: Client) {
    }

    public getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getBrokers().map((broker) => {
            return new BrokerItem(this.client, broker);
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

export class BrokerItem implements NodeBase {
    public label: string;
    public description?: string;
    public readonly contextValue = "broker";

    private broker: Broker;

    constructor(private client: Client, broker: Broker) {
        this.label = `${broker.host}:${broker.port}`;

        if (broker.isController) {
            this.description = "Controller";
        }

        this.broker = broker;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configNode = new ConfigsItem("brokerconfigs", () => this.client.getBrokerConfigs(this.broker.id));
        return Promise.resolve([configNode]);
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: this.broker.isConnected ? icons.serverConnected : icons.server,
        };
    }
}
