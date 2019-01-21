import * as vscode from "vscode";

import { Client } from "../client";
import { CreateTopicCommandHandler } from "./createTopicCommandHandler";

const waitUntilConnected = async (client: Client, handler: () => Promise<any>) => {
    if (!client.canConnect()) {
        vscode.window.showInformationMessage("No kafka host configured");
        return;
    }

    await client.connect();
    return handler();
};

export { CreateTopicCommandHandler, waitUntilConnected };
