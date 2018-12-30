import * as vscode from "vscode";

import { Client } from "./client";
import { KafkaExplorer } from "./explorer";
import { createSettings } from "./settings";

export function activate(context: vscode.ExtensionContext) {
    const settings = createSettings();
    const client = new Client("127.0.0.1:9092");
    const explorer = new KafkaExplorer(client, settings);

    const settingsChangedHandlerDisposable = settings.onDidChangeSettings(async () => {
        if (settings.host) {
            explorer.client = new Client(settings.host);
        }

        explorer.refresh();
    });

    vscode.window.registerTreeDataProvider("kafkaExplorer", explorer);
    vscode.commands.registerCommand("vscode-kafka.explorer.refresh", () => explorer.refresh());

    context.subscriptions.push(settingsChangedHandlerDisposable);
    context.subscriptions.push(client);
    context.subscriptions.push(explorer);
}

export function deactivate() {
}
