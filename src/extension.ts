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
    StopConsumerCommandHandler,
    ToggleConsumerCommandHandler,
    AddClusterCommandHandler,
    DeleteClusterCommandHandler,
    SelectClusterCommandHandler,
    handleErrors,
    ClearConsumerViewCommandHandler,
    DeleteConsumerGroupCommandHandler,
    DeleteConsumerGroupCommand,
    LaunchConsumerCommand,
    ProduceRecordCommand
} from "./commands";
import { Context } from "./context";
import { BrokerItem, KafkaExplorer, TopicItem } from "./explorer";
import { ConsumerVirtualTextDocumentProvider, OutputChannelProvider } from "./providers";
import { getClusterSettings, getWorkspaceSettings } from "./settings";
import { ClusterItem } from "./explorer/models/cluster";
import { TopicGroupItem } from "./explorer/models/topics";
import { ConsumerStatusBarItem } from "./views/consumerStatusBarItem";
import { SelectedClusterStatusBarItem } from "./views/selectedClusterStatusBarItem";
import { NodeBase } from "./explorer/models/nodeBase";
import * as path from 'path';
import { markdownPreviewProvider } from "./docs/markdownPreviewProvider";
import { getDefaultKafkaExtensionParticipant } from "./kafka-extensions/registry";
import { KafkaExtensionParticipant } from "./kafka-extensions/api";
import { ProducerCollection } from "./client/producer";
import { startLanguageClient } from "./kafka-file/kafkaFileClient";

export function activate(context: vscode.ExtensionContext): KafkaExtensionParticipant {
    Context.register(context);

    // Settings, data etc.
    const workspaceSettings = getWorkspaceSettings();
    context.subscriptions.push(workspaceSettings.onDidChangeSettings(() => {
        explorer.refresh();
    }));
    const clusterSettings = getClusterSettings();
    const clientAccessor = getClientAccessor();
    const consumerCollection = new ConsumerCollection(clusterSettings);
    const producerCollection = new ProducerCollection(clientAccessor);
    context.subscriptions.push(clientAccessor);
    context.subscriptions.push(consumerCollection);
    context.subscriptions.push(producerCollection);

    // Views (sidebar, status bar items etc.)
    const outputChannelProvider = new OutputChannelProvider();
    context.subscriptions.push(outputChannelProvider);
    const explorer = new KafkaExplorer(workspaceSettings, clusterSettings, clientAccessor);
    context.subscriptions.push(explorer);
    context.subscriptions.push(new ConsumerStatusBarItem(consumerCollection));
    context.subscriptions.push(new SelectedClusterStatusBarItem(clusterSettings));
    const consumerVirtualTextDocumentProvider = new ConsumerVirtualTextDocumentProvider(consumerCollection, clusterSettings);

    // Commands
    const createTopicCommandHandler = new CreateTopicCommandHandler(clientAccessor, clusterSettings, explorer);
    const deleteTopicCommandHandler = new DeleteTopicCommandHandler(clientAccessor, explorer);
    const produceRecordCommandHandler = new ProduceRecordCommandHandler(clientAccessor, producerCollection, outputChannelProvider, explorer, workspaceSettings);
    const startConsumerCommandHandler = new StartConsumerCommandHandler(clientAccessor, consumerCollection, explorer);
    const stopConsumerCommandHandler = new StopConsumerCommandHandler(clientAccessor, consumerCollection, explorer);
    const listConsumersCommandHandler = new ListConsumersCommandHandler(consumerCollection);
    const toggleConsumerCommandHandler = new ToggleConsumerCommandHandler(consumerCollection);
    const clearConsumerViewCommandHandler = new ClearConsumerViewCommandHandler(consumerVirtualTextDocumentProvider);
    const deleteConsumerGroupCommandHandler = new DeleteConsumerGroupCommandHandler(clientAccessor, explorer);
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
        SelectClusterCommandHandler.commandId,
        handleErrors((clusterItem?: ClusterItem) => selectClusterCommandHandler.execute(clusterItem?.cluster.id))));
    context.subscriptions.push(vscode.commands.registerCommand(
        DeleteClusterCommandHandler.commandId,
        handleErrors((clusterItem?: ClusterItem) => deleteClusterCommandHandler.execute(clusterItem?.cluster.id))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumptopicmetadata",
        (topic?: TopicItem) => dumpTopicMetadataCommandHandler.execute(topic)));
    context.subscriptions.push(vscode.commands.registerCommand(
        DeleteTopicCommandHandler.commandId,
        (topic?: TopicItem) => deleteTopicCommandHandler.execute(topic)));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpclustermetadata",
        handleErrors(() => dumpClusterMetadataCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.dumpbrokermetadata",
        handleErrors((broker?: BrokerItem) => dumpBrokerMetadataCommandHandler.execute(broker))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.copylabel",
        handleErrors((_item?: any, selection?: NodeBase[]) => explorer.copyLabelsToClipboard(selection))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.explorer.deleteselected",
        handleErrors((_item?: any, selection?: NodeBase[]) => explorer.deleteSelectedItem(_item, selection))));
    context.subscriptions.push(vscode.commands.registerCommand(
        StartConsumerCommandHandler.commandId,
        handleErrors((command?: LaunchConsumerCommand) => startConsumerCommandHandler.execute(command))));
    context.subscriptions.push(vscode.commands.registerCommand(
        StopConsumerCommandHandler.commandId,
        handleErrors((command?: LaunchConsumerCommand) => stopConsumerCommandHandler.execute(command))));
    context.subscriptions.push(vscode.commands.registerCommand(
        "vscode-kafka.consumer.list",
        handleErrors(() => listConsumersCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        ToggleConsumerCommandHandler.commandId,
        handleErrors(() => toggleConsumerCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        ClearConsumerViewCommandHandler.commandId,
        handleErrors(() => clearConsumerViewCommandHandler.execute())));
    context.subscriptions.push(vscode.commands.registerCommand(
        DeleteConsumerGroupCommandHandler.commandId,
        handleErrors((command: DeleteConsumerGroupCommand) => deleteConsumerGroupCommandHandler.execute(command))));
    context.subscriptions.push(vscode.commands.registerCommand(ProduceRecordCommandHandler.commandId,
        handleErrors((command: ProduceRecordCommand, times: number) => produceRecordCommandHandler.execute(command, times))));

    registerVSCodeKafkaDocumentationCommands(context);

    // .kafka file related
    context.subscriptions.push(
        startLanguageClient(clusterSettings, producerCollection, consumerCollection, explorer, context)
    );

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            ConsumerVirtualTextDocumentProvider.SCHEME, consumerVirtualTextDocumentProvider)
    );

    return getDefaultKafkaExtensionParticipant();
}

export function deactivate(): void {
    // noop
}

function registerVSCodeKafkaDocumentationCommands(context: vscode.ExtensionContext): void {
    // Register commands for VSCode Kafka documentation
    context.subscriptions.push(markdownPreviewProvider);
    context.subscriptions.push(vscode.commands.registerCommand("vscode-kafka.open.docs.home", async () => {
        const uri = 'README.md';
        const title = 'Kafka Documentation';
        const sectionId = '';
        markdownPreviewProvider.show(context.asAbsolutePath(path.join('docs', uri)), title, sectionId, context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("vscode-kafka.open.docs.page", async (params: { page: string, section: string }) => {
        const page = params.page.endsWith('.md') ? params.page.substr(0, params.page.length - 3) : params.page;
        const uri = page + '.md';
        const sectionId = params.section || '';
        const title = 'Kafka ' + page;
        markdownPreviewProvider.show(context.asAbsolutePath(path.join('docs', uri)), title, sectionId, context);
    }));
}
