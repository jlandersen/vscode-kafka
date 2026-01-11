import * as vscode from "vscode";

export abstract class NodeBase {
    public label?: string;
    public abstract contextValue: string;
    public abstract collapsibleState: vscode.TreeItemCollapsibleState;
    public iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
    public description?: string;
    protected children: NodeBase[] | null = null;

    constructor(private parent: NodeBase | undefined) {

    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: this.collapsibleState,
            iconPath: this.iconPath,
            description: this.description,
        };
    }

    computeChildren(): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }

    async getChildren(): Promise<NodeBase[]> {
        if (!this.children) {
            this.children = await this.computeChildren();
        }
        return this.children;
    }

    getParent(): NodeBase | undefined {
        return this.parent;
    }

    public toString(): string {
        return this?.label || this.contextValue;
    }
}
