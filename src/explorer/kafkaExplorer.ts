import * as vscode from "vscode";

import { Client } from "../client";
import { Settings } from "../settings";
import { BrokerGroupItem } from "./models/brokers";
import { ErrorItem, InformationItem } from "./models/common";
import { ConsumerGroupsItem } from "./models/consumerGroups";
import { NodeBase } from "./models/nodeBase";
import { TopicGroupItem } from "./models/topics";

export class KafkaExplorer implements vscode.Disposable, vscode.TreeDataProvider<NodeBase> {
    private onDidChangeTreeDataEvent: vscode.EventEmitter<NodeBase | undefined>
        = new vscode.EventEmitter<NodeBase | undefined>();
    public onDidChangeTreeData?: vscode.Event<NodeBase | null | undefined> | undefined
        = this.onDidChangeTreeDataEvent.event;

    private settings: Settings;
    private _client: Client;

    constructor(client: Client, settings: Settings) {
        this._client = client;
        this.settings = settings;
    }

    get client(): Client {
        return this._client;
    }

    set client(client: Client) {
        this._client = client;
    }

    public refresh(): void {
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public getTreeItem(element: NodeBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    public getChildren(element?: NodeBase): vscode.ProviderResult<NodeBase[]> {
        if (!this.settings.host) {
            return [new InformationItem("Set kafka.hosts setting to connect")];
        }

        if (!element) {
            return this.client.connect()
                .then(() => {
                    return Promise.resolve(this.getGroupChildren());
                })
                .catch((error) => {
                    vscode.window.showErrorMessage(error.toString());
                    return Promise.resolve([new ErrorItem("Failed connecting to cluster")]);
                });
        }

        return element.getChildren(element);
    }

    public dispose(): void {
        // noop
    }

    private getGroupChildren(): NodeBase[] {
        return [
            new BrokerGroupItem(this.client),
            new TopicGroupItem(this.client),
            new ConsumerGroupsItem(this.client),
        ];
    }
}
