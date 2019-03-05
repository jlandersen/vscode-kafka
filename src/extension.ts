import * as vscode from "vscode";

import { Client } from "./client";
import {
    CreateTopicCommandHandler,
    ListConsumersCommandHandler,
    ProduceRecordCommandHandler,
    StartConsumerCommandHandler,
    ToggleConsumerCommandHandler,
    waitUntilConnected,
} from "./commands";
import { KafkaExplorer, TopicItem } from "./explorer";
import { ConsumerVirtualTextDocumentProvider, OutputChannelProvider, ProducerCodeLensProvider } from "./providers";
import { createSettings } from "./settings";
import { ConsumerStatusBarItem } from "./views/consumerStatusBarItem";

export function activate(context: vscode.ExtensionContext) {
    const settings = createSettings();
    const client = new Client({ host: settings.host });
    const explorer = new KafkaExplorer(client, settings);
    const outputChannelProvider = new OutputChannelProvider();
    context.subscriptions.push(outputChannelProvider);

    const createTopicCommandHandler = new CreateTopicCommandHandler(client, explorer);
    const produceRecordCommandHandler = new ProduceRecordCommandHandler(client, outputChannelProvider);
    const startConsumerCommandHandler = new StartConsumerCommandHandler(client);
    const listConsumersCommandHandler = new ListConsumersCommandHandler();
    const toggleConsumerCommandHandler = new ToggleConsumerCommandHandler();

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

    vscode.commands.registerCommand(
        "vscode-kafka.consumer.consume",
        (topic: TopicItem | undefined) => {
            waitUntilConnected(client, () => startConsumerCommandHandler.execute(topic));
        });

    vscode.commands.registerCommand(
        "vscode-kafka.consumer.list",
        () => {
            listConsumersCommandHandler.execute();
        });

    vscode.commands.registerCommand(
        "vscode-kafka.consumer.toggle",
        () => {
            toggleConsumerCommandHandler.execute();
        });

    context.subscriptions.push(settingsChangedHandlerDisposable);
    context.subscriptions.push(client);
    context.subscriptions.push(explorer);

    context.subscriptions.push(new ConsumerStatusBarItem());

    const documentSelector = [
        { language: "kafka", scheme: "file" },
        { language: "kafka", scheme: "untitled" },
        { language: "kafka", scheme: "kafka" },
    ];

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, new ProducerCodeLensProvider()));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
        ConsumerVirtualTextDocumentProvider.SCHEME,
        ConsumerVirtualTextDocumentProvider));
}

export function deactivate() {
}
