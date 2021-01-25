import * as vscode from "vscode";

import { ClientAccessor } from "../client";
import { WorkspaceSettings, ClusterSettings } from "../settings";
import { NodeBase } from "./models/nodeBase";
import { TreeView } from "vscode";
import { KafkaModel } from "./models/kafka";
import { ClusterItem } from "./models/cluster";
import { EOL } from 'os';
import { TopicItem } from "./models/topics";
import { SelectedClusterChangedEvent } from "../settings/clusters";
import { ConsumerGroupItem } from "./models/consumerGroups";
import { DeleteClusterCommandHandler, DeleteConsumerGroupCommandHandler, DeleteTopicCommandHandler } from "../commands";

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
            canSelectMany: true
        });
        this.clusterSettings.onDidChangeSelected((e) => {
            this.updateClusterSelection(e);
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
                if (i > 0) {
                    output += EOL;
                }
                output += nodes[i];
            }
            vscode.env.clipboard.writeText(output);
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async deleteSelectedItem(item: any, nodes: NodeBase[] | undefined): Promise<any> {
        if (!nodes) {
            if (item instanceof NodeBase) {
                // case when user click on the Trashcan icon
                nodes = [item];
            } else {
                // get selected tree items (command was executed via keyboard shortcut)
                nodes = this.tree?.selection;
            }
        }
        if (nodes && nodes.length > 0) {
            const item = nodes[0];
            if (item instanceof ClusterItem) {
                vscode.commands.executeCommand(DeleteClusterCommandHandler.commandId, item);
            } else if (item instanceof TopicItem) {
                vscode.commands.executeCommand(DeleteTopicCommandHandler.commandId, item);
            } else if (item instanceof ConsumerGroupItem) {
                vscode.commands.executeCommand(DeleteConsumerGroupCommandHandler.commandId, item);
            }
        }
    }

    private async updateClusterSelection(e: SelectedClusterChangedEvent): Promise<void> {
        // Refresh the label of the old selected cluster
        this.refreshClusterItem(e.oldClusterId);
        // Refresh the label of the new selected cluster
        this.refreshClusterItem(e.newClusterId);
    }

    private async refreshClusterItem(clusterId: string | undefined): Promise<void> {
        if (!clusterId) {
            return;
        }
        const clusterItem = await this.root?.findClusterItemById(clusterId);
        if (clusterItem !== undefined) {
            this.onDidChangeTreeDataEvent.fire(clusterItem);
        }
    }

}
