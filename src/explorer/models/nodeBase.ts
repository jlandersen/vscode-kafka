import * as vscode from "vscode";

export abstract class NodeBase {
    public label?: string;
    public abstract contextValue: string;
    public abstract collapsibleState: vscode.TreeItemCollapsibleState;
    public iconPath?: string | { light: string | vscode.Uri; dark: string | vscode.Uri };
    public description?: string;

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: this.collapsibleState,
            iconPath: this.iconPath,
            description: this.description,
        };
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}
