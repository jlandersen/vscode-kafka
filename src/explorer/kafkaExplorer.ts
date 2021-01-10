import * as vscode from "vscode";

import { ClientAccessor } from "../client";
import { WorkspaceSettings, ClusterSettings } from "../settings";
import { NodeBase } from "./models/nodeBase";
import { TreeView } from "vscode";
import { KafkaModel } from "./models/kafka";
import { ClusterItem } from "./models/cluster";
import { EOL } from 'os';

const TREEVIEW_ID = 'kafkaExplorer';

/**
 * Kafka explorer to show in a tree clusters, topics.
 */
export class KafkaExplorer implements vscode.Disposable, vscode.TreeDataProvider<NodeBase> {

    private onDidChangeTreeDataEvent: vscode.EventEmitter<NodeBase | undefined>
        = new vscode.EventEmitter<NodeBase | undefined>();
    readonly onDidChangeTreeData?: vscode.Event<NodeBase | null | undefined> | undefined
        = this.onDidChangeTreeDataEvent.event;

    private readonly clusterSettings: ClusterSettings;
    private readonly clientAccessor: ClientAccessor;

    protected tree: TreeView<NodeBase> | undefined;

    private root: KafkaModel | null;

    constructor(
        settings: WorkspaceSettings,
        clusterSettings: ClusterSettings,
        clientAccessor: ClientAccessor) {
        this.clusterSettings = clusterSettings;
        this.clientAccessor = clientAccessor;
        this.root = null;
        this.tree = vscode.window.createTreeView(TREEVIEW_ID, {
            treeDataProvider: this,
            canSelectMany:true
        });
    }

    public refresh(): void {
        // reset the kafka model
        this.root = null;
        // refresh the treeview
        this.onDidChangeTreeDataEvent.fire(undefined);
    }

    public show(): void {
        vscode.commands.executeCommand(`${TREEVIEW_ID}.focus`);
    }

    public getTreeItem(element: NodeBase): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    async getChildren(element?: NodeBase): Promise<NodeBase[]> {
        if (!element) {
            if (!this.root) {
                this.root = new KafkaModel(this.clusterSettings, this.clientAccessor);
            }
            element = this.root;
        }
        return element.getChildren();
    }

    public getParent(element: NodeBase): NodeBase | undefined {
        if (element instanceof ClusterItem) {
            return undefined;
        }
        return element.getParent();
    }

    public dispose(): void {
        if (this.root) {
            this.root.dispose();
        }
    }

    /**
     * Select the given cluster name in the tree.
     *
     * @param clusterName the cluster name to select.
     */
    async selectClusterByName(clusterName: string): Promise<void> {
        const clusterItem = await this.root?.findClusterItemByName(clusterName);
        if (!clusterItem) {
            return;
        }
        this.selectItem(clusterItem);
    }

    /**
     * Select the given topic name which belongs to the given cluster in the tree.
     *
     * @param clusterName the owner cluster name
     * @param topicName the topic name
     */
    async selectTopic(clusterName: string, topicName: string): Promise<void> {
        const clusterItem = await this.root?.findClusterItemByName(clusterName);
        if (!clusterItem) {
            return;
        }
        const topicItem = await (<ClusterItem>clusterItem).findTopictemByName(topicName);
        if (!topicItem) {
            return;
        }
        this.selectItem(topicItem);
    }

    private selectItem(item: NodeBase): void {
        this.tree?.reveal(item, {
            select: true,
            expand: true,
            focus: true
        });
    }

    public async copyLabelsToClipboard(nodes: NodeBase[] | undefined): Promise<void> {
        if (!nodes) {
            //get selected tree items (command was executed via keyboard shortcut)
            nodes = this.tree?.selection;
        }
        if (nodes && nodes.length > 0) {
            let output = '';
            for (let i = 0; i < nodes.length; i++) {
                if (i> 0) {
                    output+=EOL;
                }
                output+=nodes[i];
            }
            vscode.env.clipboard.writeText(output);
        }
    }

}
