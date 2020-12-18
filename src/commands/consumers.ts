import * as vscode from "vscode";

import { ConsumerCollection, Topic, ClientAccessor } from "../client";
import { pickTopic } from "./common";
import { ClusterSettings } from "../settings";
import { CommonMessages } from "../constants";
import { KafkaExplorer } from "../explorer";

export interface StartConsumerCommand {
    clusterId: string;
    topic: Topic;
}

export class StartConsumerCommandHandler {
    constructor(
        private clientAccessor: ClientAccessor,
        private clusterSettings: ClusterSettings,
        private consumerCollection: ConsumerCollection,
        private explorer: KafkaExplorer
        ) {
    }

    async execute(startConsumerCommand?: StartConsumerCommand): Promise<void> {
        if (!startConsumerCommand) {
            const selectedCluster = this.clusterSettings.selected;

            if (!selectedCluster) {
                CommonMessages.showNoSelectedCluster();
                return;
            }

            const topic = await pickTopic(this.clientAccessor.get(selectedCluster.id));

            if (topic === undefined) {
                return;
            }

            startConsumerCommand = {
                topic,
                clusterId: selectedCluster.id,
            };
        }

        const consumeUri = vscode.Uri.parse(`kafka:${startConsumerCommand.clusterId}/${startConsumerCommand.topic.id}`);

        if (this.consumerCollection.has(consumeUri)) {
            vscode.window.showInformationMessage(`Consumer already started on '${startConsumerCommand.topic.id}'`);
        } else {
            this.consumerCollection.create(consumeUri);
            this.explorer.refresh();
        }
    }
}

export class ToggleConsumerCommandHandler {
    constructor(private consumerCollection: ConsumerCollection) {
    }

    async execute(): Promise<void> {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        const { document } = vscode.window.activeTextEditor;
        if (document.uri.scheme !== "kafka") {
            return;
        }

        if (this.consumerCollection.has(document.uri)) {
            this.consumerCollection.close(document.uri);
        } else {
            this.consumerCollection.create(document.uri);
        }
    }
}

enum ConsumerOption {
    Open,
    Close,
}

export class ListConsumersCommandHandler {
    private static optionQuickPickItems = [
        {
            label: "Open existing",
            option: ConsumerOption.Open,
        },
        {
            label: "Close",
            option: ConsumerOption.Close,
        },
    ];

    constructor(private consumerCollection: ConsumerCollection) {
    }

    async execute(): Promise<void> {
        const consumers = this.consumerCollection.getAll();
        const consumerQuickPickItems = consumers.map((c) => {
            return {
                label: c.options.topic,
                description: c.options.bootstrap,
                uri: c.uri,
            };
        });

        const pickedConsumer = await vscode.window.showQuickPick(consumerQuickPickItems);

        if (!pickedConsumer) {
            return;
        }

        const pickedOption = await vscode.window.showQuickPick(ListConsumersCommandHandler.optionQuickPickItems);

        if (!pickedOption) {
            return;
        }

        switch (pickedOption.option) {
            case ConsumerOption.Open:
                openDocument(pickedConsumer.uri);
                break;
            case ConsumerOption.Close:
                this.consumerCollection.close(pickedConsumer.uri);
                break;
        }
    }

}

async function openDocument(uri: vscode.Uri): Promise<void> {

    const visibleConsumerEditor = vscode.window.visibleTextEditors.find(te => te.document.uri.toString() === uri.toString());
    if (visibleConsumerEditor) {
        //Document already exists and is active, nothing to do
        return;
    }

    // Then we check if the document is already open
    const docs = vscode.workspace.textDocuments;
    let document: vscode.TextDocument | undefined = docs.find(doc => doc.uri.toString() === uri.toString());

    // If there's no document we open it
    if (!document) {
       document = await vscode.workspace.openTextDocument(uri);
    }

    // Check if there's an active editor, to later decide in which column the consumer
    // view will be opened
    const hasActiveEditor = !!vscode.window.activeTextEditor;

    // Finally reveal the document
    //
    // Caveat #1: For documents opened programatically, then closed from the UI,
    // VS Code doesn't instantly trigger onDidCloseTextDocument, so there's a
    // chance the document instance we just retrieved doesn't correspond to an
    // actual TextEditor.
    // See https://github.com/microsoft/vscode/issues/15178
    //
    // Caveat #2: if a document is opened in a different panel, it's not revealed.
    // Instead, a new TextEditor instance is added to the active panel. This is the
    // default vscode behavior
    await vscode.window.showTextDocument(
            document,
            {
                preview: false,
                preserveFocus: true,
                viewColumn: hasActiveEditor?vscode.ViewColumn.Beside:vscode.ViewColumn.Active,
            }
        );
    await vscode.languages.setTextDocumentLanguage(document, "kafka-consumer");
}
