import * as vscode from "vscode";

import { ConfigEntry } from "../../client";
import { Icons } from "../../constants";
import { NodeBase } from "./nodeBase";

/**
 * A node used to display an error message
 */
export class ErrorItem extends NodeBase {
    public contextValue = "error";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    public iconPath = Icons.Warning;

    constructor(message: string) {
        super();
        this.label = message;
    }
}

/**
 * A node used to display an info message
 */
export class InformationItem extends NodeBase {
    public contextValue = "information";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    public iconPath = Icons.Information;

    constructor(message: string) {
        super();
        this.label = message;
    }
}

/**
 * A node that generates a tree of config entries given a provider
 */
export class ConfigsItem extends NodeBase {
    public label = "Configs";
    public contextValue = "configs";
    public collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    constructor(private provider: () => Promise<ConfigEntry[]>) {
        super();
    }

    async getChildren(element: NodeBase): Promise<NodeBase[]> {
        const configEntries = await this.provider();
        return configEntries
            .sort((a, b) => (a.configName < b.configName ? -1 : (a.configName > b.configName) ? 1 : 0))
            .map((configEntry) => (new ConfigEntryItem(configEntry)));
    }
}

/**
 * A node that displays the value of a single config entry
 */
class ConfigEntryItem extends NodeBase {
    public contextValue: string = "configitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(configEntry: ConfigEntry) {
        super();
        this.label = configEntry.configName;
        this.description = configEntry.configValue;
    }
}
