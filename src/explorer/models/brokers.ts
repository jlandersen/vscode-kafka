import * as vscode from "vscode";

import { Broker, Client } from "../../client";
import { icons } from "../../constants";
import { NodeBase } from "./nodeBase";

export class BrokerGroupItem implements NodeBase {
    public readonly contextValue = "brokers";
    public readonly label = "Brokers";
    public iconPath?: string;

    constructor(private client: Client) {
    }

    public getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve(this.client.getBrokers().map((broker) => {
            return new BrokerItem(broker);
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

    constructor(broker: Broker) {
        this.label = `${broker.host}:${broker.port}`;

        if (broker.isController) {
            this.description = "Controller";
        }

        this.broker = broker;
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: this.broker.isConnected ? icons.serverConnected : icons.server,
        };
    }
}
