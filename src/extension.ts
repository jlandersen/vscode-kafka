import * as vscode from "vscode";

import { Client } from "./client";
import {
    CreateTopicCommandHandler,
    DumpBrokerMetadataCommandHandler,
    DumpClusterMetadataCommandHandler,
    DumpTopicMetadataCommandHandler,
    ListConsumersCommandHandler,
    ProduceRecordCommandHandler,
    StartConsumerCommandHandler,
    ToggleConsumerCommandHandler,
    waitUntilConnected,
} from "./commands";
import { BrokerItem, KafkaExplorer, TopicItem } from "./explorer";
import { ConsumerVirtualTextDocumentProvider, OutputChannelProvider, ProducerCodeLensProvider } from "./providers";
import { createSettings } from "./settings";
import { ConsumerStatusBarItem } from "./views/consumerStatusBarItem";

export function activate(context: vscode.ExtensionContext) {
    const settings = createSettings();
    const client = new Client(settings);
    const explorer = new KafkaExplorer(client, settings);
    const outputChannelProvider = new OutputChannelProvider();
    const createTopicCommandHandler = new CreateTopicCommandHandler(client, explorer);
    const produceRecordCommandHandler = new ProduceRecordCommandHandler(client, outputChannelProvider);
    const startConsumerCommandHandler = new StartConsumerCommandHandler(client);
    const listConsumersCommandHandler = new ListConsumersCommandHandler();
    const toggleConsumerCommandHandler = new ToggleConsumerCommandHandler();
    const dumpTopicMetadataCommandHandler = new DumpTopicMetadataCommandHandler(client, outputChannelProvider);
    const dumpClusterMetadataCommandHandler = new DumpClusterMetadataCommandHandler(client, outputChannelProvider);
    const dumpBrokerMetadataCommandHandler = new DumpBrokerMetadataCommandHandler(client, outputChannelProvider);

    context.subscriptions.push(settings.onDidChangeSettings(() => {
        client.refresh(settings);
        explorer.refresh();
    }));
    context.subscriptions.push(outputChannelProvider);
    context.subscriptions.push(client);
    context.subscriptions.push(explorer);
    context.subscriptions.push(new ConsumerStatusBarItem());
    context.subscriptions.push(vscode.window.registerTreeDataProvider("kafkaExplorer", explorer));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.refresh",
        () => explorer.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.createtopic",
        () => waitUntilConnected(client, () => createTopicCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.produce",
        (document: vscode.TextDocument, range: vscode.Range, times: number) =>
            waitUntilConnected(client, () => produceRecordCommandHandler.execute(document, range, times))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumptopicmetadata",
        (topic?: TopicItem) => {
            waitUntilConnected(client, () => dumpTopicMetadataCommandHandler.execute(topic));
        }));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpclustermetadata",
        () => {
            waitUntilConnected(client, () => dumpClusterMetadataCommandHandler.execute());
        }));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpbrokermetadata",
        (broker?: BrokerItem) => {
            waitUntilConnected(client, () => dumpBrokerMetadataCommandHandler.execute(broker));
        }));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.consume",
        (topic?: TopicItem) =>
            waitUntilConnected(client, () => startConsumerCommandHandler.execute(topic))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.list",
        () => listConsumersCommandHandler.execute()));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.toggle",
        () => toggleConsumerCommandHandler.execute()));

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
