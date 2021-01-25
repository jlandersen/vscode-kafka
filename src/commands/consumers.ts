import * as vscode from "vscode";

import { pickClient, pickConsumerGroupId, pickTopic } from "./common";
import { ConsumerCollection, ClientAccessor, createConsumerUri, ConsumerInfoUri, parsePartitions } from "../client";
import { KafkaExplorer } from "../explorer";
import { ConsumerVirtualTextDocumentProvider } from "../providers";

export interface LaunchConsumerCommand extends ConsumerInfoUri {

}

/**
 * Start or stop a consumer.
 */
abstract class LaunchConsumerCommandHandler {

    constructor(
        private clientAccessor: ClientAccessor,
        private consumerCollection: ConsumerCollection,
        private explorer: KafkaExplorer,
        private start: boolean
    ) {
    }

    async execute(command?: LaunchConsumerCommand): Promise<void> {
        if (!command) {
            const client = await pickClient(this.clientAccessor);
            if (!client) {
                return;
            }

            const topic = await pickTopic(client);

            if (topic === undefined) {
                return;
            }

            const clusterId = client.cluster.id;
            const topicId = topic.id;
            command = {
                clusterId,
                consumerGroupId: `vscode-kafka-${clusterId}-${topicId}`,
                topicId
            };
        }
        if (!command.consumerGroupId) {
            const { clusterId, topicId } = command;
            command.consumerGroupId = `vscode-kafka-${clusterId}-${topicId}`;
        }

        try {
            const consumer = this.consumerCollection.getByConsumerGroupId(command.clusterId, command.consumerGroupId);
            if (this.start) {
                // Try to start consumer

                if (consumer) {
                    vscode.window.showInformationMessage(`Consumer already started on '${command.topicId}'`);
                    return;
                }

                // Validate start command
                validatePartitions(command.partitions);
                validateOffset(command.fromOffset);

                // Start the consumer and open the document which tracks consumer messages.
                const consumeUri = createConsumerUri(command);
                this.consumerCollection.create(consumeUri);
                openDocument(consumeUri);
                this.explorer.refresh();
            } else {
                // Stop consumer
                if (consumer) {
                    const consumeUri = consumer.uri;
                    this.consumerCollection.close(consumeUri);
                    openDocument(consumeUri);
                    this.explorer.refresh();
                }
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error while ${this.start ? 'starting' : 'stopping'} the consumer: ${e.message}`);
        }
    }
}

export class StartConsumerCommandHandler extends LaunchConsumerCommandHandler {

    public static commandID = 'vscode-kafka.consumer.start';

    constructor(
        clientAccessor: ClientAccessor,
        consumerCollection: ConsumerCollection,
        explorer: KafkaExplorer
    ) {
        super(clientAccessor, consumerCollection, explorer, true);
    }
}

export class StopConsumerCommandHandler extends LaunchConsumerCommandHandler {

    public static commandId = 'vscode-kafka.consumer.stop';

    constructor(
        clientAccessor: ClientAccessor,
        consumerCollection: ConsumerCollection,
        explorer: KafkaExplorer
    ) {
        super(clientAccessor, consumerCollection, explorer, false);
    }
}

function validatePartitions(partitions?: string) {
    if (!partitions) {
        return;
    }
    parsePartitions(partitions);
}

function validateOffset(offset?: string) {
    if (!offset || offset === 'earliest' || offset === 'latest') {
        return;
    }
    const valueAsNumber = parseInt(offset, 10);
    if (isNaN(valueAsNumber) || valueAsNumber < 0) {
        throw new Error(`from must be a positive number or equal to 'earliest' or 'latest'.`);
    }
}

export class ToggleConsumerCommandHandler {

    public static commandId = 'vscode-kafka.consumer.toggle';

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
export class ClearConsumerViewCommandHandler {

    public static commandId = 'vscode-kafka.consumer.clear';

    constructor(private provider: ConsumerVirtualTextDocumentProvider) {

    }
    async execute(): Promise<void> {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        const { document } = vscode.window.activeTextEditor;
        if (document.uri.scheme !== "kafka") {
            return;
        }
        this.provider.clear(document);
    }
}

enum ConsumerOption {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Open,
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
                label: c.options.topicId,
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

export interface DeleteConsumerGroupCommand {
    clusterId: string;
    consumerGroupId: string;
}

export class DeleteConsumerGroupCommandHandler {

    public static commandId = 'vscode-kafka.consumer.deletegroup';

    constructor(
        private clientAccessor: ClientAccessor,
        private explorer: KafkaExplorer
    ) {
    }

    async execute(command?: DeleteConsumerGroupCommand): Promise<void> {
        const client = await pickClient(this.clientAccessor, command?.clusterId);
        if (!client) {
            return;
        }

        const consumerGroupToDelete: string | undefined = command?.consumerGroupId || await pickConsumerGroupId(client);
        if (!consumerGroupToDelete) {
            return;
        }
        try {
            const warning = `Are you sure you want to delete consumer group '${consumerGroupToDelete}'?`;
            const deleteConfirmation = await vscode.window.showWarningMessage(warning, 'Cancel', 'Delete');
            if (deleteConfirmation !== 'Delete') {
                return;
            }

            await client.deleteConsumerGroups([consumerGroupToDelete]);
            this.explorer.refresh();
            vscode.window.showInformationMessage(`Consumer group '${consumerGroupToDelete}' deleted successfully`);
        } catch (error) {
            if (error.message) {
                vscode.window.showErrorMessage(error.message);
            } else {
                vscode.window.showErrorMessage(error);
            }
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
            viewColumn: hasActiveEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
        }
    );
    await vscode.languages.setTextDocumentLanguage(document, "kafka-consumer");
}
