import * as vscode from "vscode";

export interface NodeBase {
    label: string;
    contextValue: string;
    iconPath?: string;
    getTreeItem(): vscode.TreeItem;
    getChildren(element: NodeBase): Promise<NodeBase[]>;
}
