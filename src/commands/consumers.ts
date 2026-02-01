import * as vscode from "vscode";

import { pickClient, pickConsumerGroupId, pickTopic } from "./common";
import { ConsumerCollection, ClientAccessor, createConsumerUri, ConsumerInfoUri, ConsumerLaunchState } from "../client";
import { KafkaExplorer } from "../explorer";
import { ConsumerVirtualTextDocumentProvider } from "../providers";
import { ProgressLocation, window } from "vscode";
import { getErrorMessage } from "../errors";
import { ConsumerValidator } from "../validators/consumer";

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
                    //  The consumer is already started, just open the document which tracks consumer messages.
                    const consumeUri = createConsumerUri(command);
                    openDocument(consumeUri);
                    return;
                }

                // Validate start command
                ConsumerValidator.validate(command);

                //  Open the document which tracks consumer messages.
                const consumeUri = createConsumerUri(command);
                openDocument(consumeUri);

                // Start the consumer
                await startConsumerWithProgress(consumeUri, this.consumerCollection, this.explorer);
            } else {
                // Stop the consumer
                if (consumer) {
                    const consumeUri = consumer.uri;
                    await stopConsumerWithProgress(consumeUri, this.consumerCollection, this.explorer);
                }
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error while ${this.start ? 'starting' : 'stopping'} the consumer: ${getErrorMessage(e)}`);
        }
    }
}

export class StartConsumerCommandHandler extends LaunchConsumerCommandHandler {

    public static commandId = 'vscode-kafka.consumer.start';

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

export class ToggleConsumerCommandHandler {

    public static commandId = 'vscode-kafka.consumer.toggle';

    constructor(private consumerCollection: ConsumerCollection) {
    }

    async execute(): Promise<void> {
        if (!vscode.window.activeTextEditor) {
            return;
        }

        const { uri } = vscode.window.activeTextEditor.document;
        if (uri.scheme !== "kafka") {
            return;
        }

        const started = this.consumerCollection.has(uri);
        try {
            if (started) {
                await stopConsumerWithProgress(uri, this.consumerCollection);
            } else {
                await startConsumerWithProgress(uri, this.consumerCollection);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error while ${!started ? 'starting' : 'stopping'} the consumer: ${getErrorMessage(e)}`);
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
            vscode.window.showErrorMessage(`Error deleting consumer group: ${getErrorMessage(error)}`);
        }
    }
}

async function startConsumerWithProgress(consumeUri: vscode.Uri, consumerCollection: ConsumerCollection, explorer?: KafkaExplorer) {
    const consumer = consumerCollection.get(consumeUri);
    if (consumer && consumer.state === ConsumerLaunchState.closing) {
        vscode.window.showErrorMessage(`The consumer cannot be started because it is stopping.`);
        return;
    }
    await window.withProgress({
        location: ProgressLocation.Window,
        title: `Starting consumer '${consumeUri}'.`,
        cancellable: false
    }, (progress, token) => {
        return new Promise((resolve, reject) => {
            consumerCollection.create(consumeUri)
                .then(consumer => {
                    if (explorer) {
                        explorer.refresh();
                    }
                    resolve(consumer);
                })
                .catch(error => reject(error));
        });
    });
}

async function stopConsumerWithProgress(consumeUri: vscode.Uri, consumerCollection: ConsumerCollection, explorer?: KafkaExplorer) {
    const consumer = consumerCollection.get(consumeUri);
    if (consumer && consumer.state === ConsumerLaunchState.starting) {
        vscode.window.showErrorMessage(`The consumer cannot be stopped because it is starting.`);
        return;
    }
    await window.withProgress({
        location: ProgressLocation.Window,
        title: `Stopping consumer '${consumeUri}'.`,
        cancellable: false
    }, (progress, token) => {
        return new Promise((resolve, reject) => {
            consumerCollection.close(consumeUri)
                .then(() => {
                    if (explorer) {
                        explorer.refresh();
                    }
                    resolve(true);
                })
                .catch(error => reject(error));
        });
    });
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
