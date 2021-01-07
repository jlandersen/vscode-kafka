import * as vscode from "vscode";

import { getClientAccessor, ConsumerCollection } from "./client";
import {
    CreateTopicCommandHandler,
    DeleteTopicCommandHandler,
    DumpBrokerMetadataCommandHandler,
    DumpClusterMetadataCommandHandler,
    DumpTopicMetadataCommandHandler,
    ListConsumersCommandHandler,
    ProduceRecordCommandHandler,
    StartConsumerCommandHandler,
    ToggleConsumerCommandHandler,
    AddClusterCommandHandler,
    DeleteClusterCommandHandler,
    SelectClusterCommandHandler,
    handleErrors,
} from "./commands";
import { Context } from "./context";
import { BrokerItem, KafkaExplorer, TopicItem } from "./explorer";
import { ConsumerVirtualTextDocumentProvider, OutputChannelProvider, ProducerCodeLensProvider } from "./providers";
import { getClusterSettings, getWorkspaceSettings } from "./settings";
import { ClusterItem } from "./explorer/models/cluster";
import { TopicGroupItem } from "./explorer/models/topics";
import { ConsumerStatusBarItem } from "./views/consumerStatusBarItem";
import { SelectedClusterStatusBarItem } from "./views/selectedClusterStatusBarItem";

export function activate(context: vscode.ExtensionContext): void {
    Context.register(context);

    // Settings, data etc.
    const workspaceSettings = getWorkspaceSettings();
    context.subscriptions.push(workspaceSettings.onDidChangeSettings(() => {
        explorer.refresh();
    }));
    const clusterSettings = getClusterSettings();
    const clientAccessor = getClientAccessor();
    const consumerCollection = new ConsumerCollection(clusterSettings);
    context.subscriptions.push(clientAccessor);
    context.subscriptions.push(consumerCollection);


    // Views (sidebar, status bar items etc.)
    const outputChannelProvider = new OutputChannelProvider();
    context.subscriptions.push(outputChannelProvider);
    const explorer = new KafkaExplorer(workspaceSettings, clusterSettings, clientAccessor);
    context.subscriptions.push(explorer);
    context.subscriptions.push(vscode.window.registerTreeDataProvider("kafkaExplorer", explorer));
    context.subscriptions.push(new ConsumerStatusBarItem(consumerCollection));
    context.subscriptions.push(new SelectedClusterStatusBarItem(clusterSettings));

    // Commands
    const createTopicCommandHandler = new CreateTopicCommandHandler(clientAccessor, clusterSettings, explorer);
    const deleteTopicCommandHandler = new DeleteTopicCommandHandler(clientAccessor, explorer);
    const produceRecordCommandHandler = new ProduceRecordCommandHandler(clientAccessor, outputChannelProvider, explorer, workspaceSettings);
    const startConsumerCommandHandler = new StartConsumerCommandHandler(clientAccessor, clusterSettings, consumerCollection, explorer);
    const listConsumersCommandHandler = new ListConsumersCommandHandler(consumerCollection);
    const toggleConsumerCommandHandler = new ToggleConsumerCommandHandler(consumerCollection);
    const addClusterCommandHandler = new AddClusterCommandHandler(clusterSettings, explorer);
    const deleteClusterCommandHandler = new DeleteClusterCommandHandler(clusterSettings, clientAccessor, explorer);
    const selectClusterCommandHandler = new SelectClusterCommandHandler(clusterSettings);
    const dumpTopicMetadataCommandHandler = new DumpTopicMetadataCommandHandler(clientAccessor, outputChannelProvider);
    const dumpClusterMetadataCommandHandler = new DumpClusterMetadataCommandHandler(clientAccessor, outputChannelProvider);
    const dumpBrokerMetadataCommandHandler = new DumpBrokerMetadataCommandHandler(clientAccessor, outputChannelProvider);

    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.refresh",
        handleErrors(() => Promise.resolve(explorer.refresh()))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.createtopic",
        handleErrors((topicGroupItem?: TopicGroupItem) => createTopicCommandHandler.execute(topicGroupItem?.getParent().cluster.id))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.addcluster",
        handleErrors(() => addClusterCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.selectcluster",
        handleErrors((clusterItem?: ClusterItem) => selectClusterCommandHandler.execute(clusterItem?.cluster.id))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.deletecluster",
        handleErrors((clusterItem?: ClusterItem) => deleteClusterCommandHandler.execute(clusterItem?.cluster.id))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.produce",
        handleErrors((document: vscode.TextDocument, range: vscode.Range, times: number) => produceRecordCommandHandler.execute(document, range, times))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumptopicmetadata",
        (topic?: TopicItem) => dumpTopicMetadataCommandHandler.execute(topic)));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.deletetopic",
        (topic?: TopicItem) => deleteTopicCommandHandler.execute(topic)));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpclustermetadata",
        handleErrors(() => dumpClusterMetadataCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpbrokermetadata",
        handleErrors((broker?: BrokerItem) => dumpBrokerMetadataCommandHandler.execute(broker))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.consume",
        handleErrors((topic?: TopicItem) => startConsumerCommandHandler.execute(topic))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.list",
        handleErrors(() => listConsumersCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.toggle",
        handleErrors(() => toggleConsumerCommandHandler.execute())));

    // .kafka file related
    const documentSelector = [
        { language: "kafka", scheme: "file" },
        { language: "kafka", scheme: "untitled" },
        { language: "kafka", scheme: "kafka" },
    ];

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, new ProducerCodeLensProvider()));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
        ConsumerVirtualTextDocumentProvider.SCHEME,
        new ConsumerVirtualTextDocumentProvider(consumerCollection)));
}

export function deactivate(): void {
    // noop
}
