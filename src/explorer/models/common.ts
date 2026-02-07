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

    constructor(message: string, parent: NodeBase) {
        super(parent);
        this.label = message;
    }
}

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error) {
        return error;
    }
    return "Unknown error";
};

/**
 * A node used to display an info message
 */
export class InformationItem extends NodeBase {
    public contextValue = "information";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;
    public iconPath = Icons.Information;

    constructor(message: string, parent: NodeBase) {
        super(parent);
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

    constructor(private provider: () => Promise<ConfigEntry[]>,  parent: NodeBase) {
        super(parent);
    }

    async computeChildren(): Promise<NodeBase[]> {
        try {
            const configEntries = await this.provider();
            return configEntries
                .sort((a, b) => (a.configName < b.configName ? -1 : (a.configName > b.configName) ? 1 : 0))
                .map((configEntry) => (new ConfigEntryItem(configEntry, this)));
        } catch (error) {
            return [new ErrorItem(`Failed to load configs: ${getErrorMessage(error)}`, this)];
        }
    }
}

/**
 * A node that displays the value of a single config entry
 */
class ConfigEntryItem extends NodeBase {
    public contextValue = "configitem";
    public collapsibleState = vscode.TreeItemCollapsibleState.None;

    constructor(configEntry: ConfigEntry, parent: NodeBase) {
        super(parent);
        this.label = configEntry.configName;
        // configValue may be null for sensitive configs, but TreeItem.description must be string | undefined
        this.description = configEntry.configValue ?? undefined;
    }

    public toString(): string {
        return `${this.label}=${this.description||''}`;
    }

}
