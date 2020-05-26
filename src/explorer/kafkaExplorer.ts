import * as vscode from "vscode";

import { Cluster, ClientAccessor } from "../client";
import { WorkspaceSettings, ClusterSettings } from "../settings";
import { InformationItem } from "./models/common";
import { NodeBase } from "./models/nodeBase";
import { ClusterItem } from "./models/cluster";

export class KafkaExplorer implements vscode.Disposable, vscode.TreeDataProvider<NodeBase> {
    private onDidChangeTreeDataEvent: vscode.EventEmitter<NodeBase | undefined>
        = new vscode.EventEmitter<NodeBase | undefined>();
    public onDidChangeTreeData?: vscode.Event<NodeBase | null | undefined> | undefined
        = this.onDidChangeTreeDataEvent.event;

    private readonly clusterSettings: ClusterSettings;
    private readonly clientAccessor: ClientAccessor;

    constructor(
        settings: WorkspaceSettings, 
        clusterSettings: ClusterSettings,
        clientAccessor: ClientAccessor) {
        this.clusterSettings = clusterSettings;
        this.clientAccessor = clientAccessor;
    }

    public refresh(): void {
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public getTreeItem(element: NodeBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    public getChildren(element?: NodeBase): vscode.ProviderResult<NodeBase[]> {
        const clusters = this.clusterSettings.getAll();

        if (clusters.length === 0) {
            return [new InformationItem("No clusters added")];
        }

        if (!element) {
            return this.getGroupChildren(clusters);
        }

        return element.getChildren(element);
    }

    public dispose(): void {
        // noop
    }

    private getGroupChildren(clusters: Cluster[]): NodeBase[] {
        return clusters.map((c) => {
            return new ClusterItem(this.clientAccessor.get(c.id), c);
        });
    }
}
