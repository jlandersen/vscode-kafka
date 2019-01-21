import * as vscode from "vscode";

import { Client } from "./client";
import { CreateTopicCommandHandler, waitUntilConnected } from "./commands";
import { ProduceRecordCommandHandler } from "./commands/produceRecordCommandHandler";
import { KafkaExplorer } from "./explorer";
import { OutputChannelProvider } from "./providers/outputChannelProvider";
import { ProducerCodeLensProvider } from "./providers/producerCodeLensProvider";
import { createSettings } from "./settings";

export function activate(context: vscode.ExtensionContext) {
    const settings = createSettings();
    const client = new Client({ host: settings.host });
    const explorer = new KafkaExplorer(client, settings);
    const outputChannelProvider = new OutputChannelProvider();
    context.subscriptions.push(outputChannelProvider);

    const createTopicCommandHandler = new CreateTopicCommandHandler(client, explorer);
    const produceRecordCommandHandler = new ProduceRecordCommandHandler(client, outputChannelProvider);

    const settingsChangedHandlerDisposable = settings.onDidChangeSettings(() => {
        client.refresh({ host: settings.host });
        explorer.refresh();
    });

    vscode.window.registerTreeDataProvider("kafkaExplorer", explorer);
    vscode.commands.registerCommand("vscode-kafka.explorer.refresh", () => explorer.refresh());
    vscode.commands.registerCommand(
        "vscode-kafka.explorer.createtopic",
        () => waitUntilConnected(client, () => createTopicCommandHandler.execute()));

    vscode.commands.registerCommand(
        "vscode-kafka.explorer.produce",
        (document: vscode.TextDocument, range: vscode.Range, times: number) =>
                waitUntilConnected(client, () => produceRecordCommandHandler.execute(document, range, times)));

    context.subscriptions.push(settingsChangedHandlerDisposable);
    context.subscriptions.push(client);
    context.subscriptions.push(explorer);

    const documentSelector = [
        { language: "kafka", scheme: "file" },
        { language: "kafka", scheme: "untitled" },
    ];

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, new ProducerCodeLensProvider()));
}

export function deactivate() {
}
