import * as vscode from "vscode";
import { Client, ConsumerCollection, Topic } from "../client";

export interface StartConsumerCommand {
    topic: Topic;
}

export class StartConsumerCommandHandler {
    private consumerCollection = ConsumerCollection.getInstance();

    constructor(private client: Client) {
    }

    async execute(startConsumerCommand?: StartConsumerCommand) {
        if (!startConsumerCommand) {
            const topic = await this.pickTopic();

            if (topic === undefined) {
                return;
            }

            startConsumerCommand = {
                topic,
            };
        }

        const consumeUri = vscode.Uri.parse(`kafka:${startConsumerCommand.topic.id}`);

        if (this.consumerCollection.has(consumeUri)) {
            vscode.window.showErrorMessage("Consumer already exists.");
            return;
        }

        this.consumerCollection.create(consumeUri);

        const doc = await vscode.workspace.openTextDocument(consumeUri);
        await vscode.window.showTextDocument(
            doc,
            {
                preview: false,
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Beside,
            });
    }

    private async pickTopic(): Promise<Topic | undefined> {
        const topics = this.client.getTopics();
        const topicQuickPickItems = topics.map((topic) => {
            return {
                label: topic.id,
                description: `Partitions: ${topic.partitionCount}`,
                topic,
            };
        });

        const pickedTopic = await vscode.window.showQuickPick(topicQuickPickItems);

        if (!pickedTopic) {
            return;
        }

        return pickedTopic.topic;
    }
}

export class ToggleConsumerCommandHandler {
    private consumerCollection = ConsumerCollection.getInstance();

    async execute() {
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
    private consumerCollection = ConsumerCollection.getInstance();

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

    async execute() {
        const consumers = this.consumerCollection.getAll();
        const consumerQuickPickItems = consumers.map((c) => {
            return {
                label: c.options.topic,
                description: c.options.kafkaHost,
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

    private async openDocument(uri: vscode.Uri) {
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
