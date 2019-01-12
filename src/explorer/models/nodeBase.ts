import * as vscode from "vscode";
import { ConfigEntry } from "../../client";

export interface NodeBase {
    label: string;
    contextValue: string;
    iconPath?: string;
    getTreeItem(): vscode.TreeItem;
    getChildren(element: NodeBase): Promise<NodeBase[]>;
}

export class ConfigsItem  implements NodeBase {
    public label: string = "Configs";

    constructor(public contextValue: string, private provider: () => Promise<ConfigEntry[]>) {
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            contextValue: this.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        };
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configEntries = await this.provider();
        return configEntries
            .sort((a, b) => (a.configName < b.configName ? -1 : (a.configName > b.configName) ? 1 : 0))
            .map((configEntry) => (new ConfigItem(configEntry)));
    }
}

class ConfigItem implements NodeBase {
    public label: string;
    public description: string;
    public readonly contextValue: string = "configitem";

    constructor(configEntry: ConfigEntry) {
        this.label = configEntry.configName;
        this.description = configEntry.configValue;
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            description: this.description,
        };
    }

    getChildren(element: NodeBase): Promise<NodeBase[]> {
        return Promise.resolve([]);
    }
}
