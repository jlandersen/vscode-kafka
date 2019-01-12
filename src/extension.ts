import * as vscode from "vscode";

import { Client } from "./client";
import { CreateTopicCommandHandler, waitUntilConnected } from "./commands";
import { KafkaExplorer } from "./explorer";
import { createSettings } from "./settings";

export function activate(context: vscode.ExtensionContext) {
    const settings = createSettings();
    const client = new Client({ host: settings.host });
    const explorer = new KafkaExplorer(client, settings);
    const createTopicCommandHandler = new CreateTopicCommandHandler(client, explorer);

    const settingsChangedHandlerDisposable = settings.onDidChangeSettings(() => {
        client.refresh({ host: settings.host });
        explorer.refresh();
    });

    vscode.window.registerTreeDataProvider("kafkaExplorer", explorer);
    vscode.commands.registerCommand("vscode-kafka.explorer.refresh", () => explorer.refresh());
    vscode.commands.registerCommand(
        "vscode-kafka.explorer.createtopic",
        () => waitUntilConnected(client, createTopicCommandHandler));

    context.subscriptions.push(settingsChangedHandlerDisposable);
    context.subscriptions.push(client);
    context.subscriptions.push(explorer);
}

export function deactivate() {
}
