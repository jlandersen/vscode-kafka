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
            vscode.window.showErrorMessage("Consumer already exists");
            return;
        }

        this.consumerCollection.create(consumeUri);
        this.explorer.refresh();
        const doc = await vscode.workspace.openTextDocument(consumeUri);
        await vscode.window.showTextDocument(
            doc,
            {
                preview: false,
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Beside,
            });
        await vscode.languages.setTextDocumentLanguage(doc, "kafka-consumer");
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
                this.openDocument(pickedConsumer.uri);
                break;
            case ConsumerOption.Close:
                this.consumerCollection.close(pickedConsumer.uri);
                break;
        }
    }

    private async openDocument(uri: vscode.Uri): Promise<void> {
        let document: vscode.TextDocument | undefined;

        // First we check if the document is already open, in which case we just show it
        const docs = vscode.workspace.textDocuments;
        for (const doc of docs) {
            if (doc.uri.toString() === uri.toString()) {
                document = doc;
                break;
            }
        }

        // Else we just reopen it - vscode closes it after a few minutes if not open
        if (typeof document === "undefined") {
            document = await vscode.workspace.openTextDocument(uri);
        }

        await vscode.window.showTextDocument(
            document,
            {
                preview: false,
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Beside,
            });
    }
}
