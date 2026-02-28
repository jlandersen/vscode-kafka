import * as vscode from "vscode";
import { TreeView } from "vscode";
import { ClusterSettings, SchemaRegistrySettings } from "../settings";
import { NodeBase } from "./models/nodeBase";
import { SchemaRegistryConnectionsModel } from "./models/schemaRegistryConnections";
import { ExplorerRefreshTarget } from "./explorerRefresh";

const TREEVIEW_ID = "kafkaSchemaRegistriesExplorer";

export class SchemaRegistryExplorer implements vscode.Disposable, vscode.TreeDataProvider<NodeBase>, ExplorerRefreshTarget {
    private onDidChangeTreeDataEvent: vscode.EventEmitter<NodeBase | undefined>
        = new vscode.EventEmitter<NodeBase | undefined>();
    readonly onDidChangeTreeData?: vscode.Event<NodeBase | null | undefined> | undefined
        = this.onDidChangeTreeDataEvent.event;

    private readonly root: SchemaRegistryConnectionsModel;
    protected tree: TreeView<NodeBase> | undefined;

    constructor(
        schemaRegistrySettings: SchemaRegistrySettings,
        clusterSettings: ClusterSettings
    ) {
        this.root = new SchemaRegistryConnectionsModel(schemaRegistrySettings, clusterSettings);
        this.tree = vscode.window.createTreeView(TREEVIEW_ID, {
            treeDataProvider: this,
            canSelectMany: false
        });
    }

    public refresh(): void {
        this.root.clearChildrenCache();
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public refreshItem(item?: NodeBase): void {
        if (!item) {
            this.refresh();
            return;
        }
        item.clearChildrenCache();
        this.onDidChangeTreeDataEvent.fire(item);
    }

    public getTreeItem(element: NodeBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    public async getChildren(element?: NodeBase): Promise<NodeBase[]> {
        if (!element) {
            return this.root.getChildren();
        }
        return element.getChildren();
    }

    public getParent(element: NodeBase): NodeBase | undefined {
        return element.getParent();
    }

    public dispose(): void {
        this.root.dispose();
    }
}
