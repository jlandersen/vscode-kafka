import * as vscode from "vscode";

import { Client } from "../client";

export const waitUntilConnected = async (client: Client, handler: () => Promise<any>) => {
    if (!client.canConnect()) {
        vscode.window.showInformationMessage("No kafka host configured");
        return;
    }

    try {
        await client.connect();
        await handler();
    } catch (error) {
        if (error.message) {
            vscode.window.showErrorMessage("Failed operation", error.message);
        } else {
            vscode.window.showErrorMessage("Failed operation");
        }
    }
};

export * from "./consumers";
export * from "./topics";
export * from "./producers";
export * from "./cluster";
