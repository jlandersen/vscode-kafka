import * as vscode from "vscode";

import { pickClient, pickConsumerGroupId, pickTopic } from "./common";
import { ConsumerCollection, ClientAccessor, createConsumerUri, ConsumerInfoUri, ConsumerLaunchState } from "../client";
import { KafkaExplorer } from "../explorer";
import { ConsumerTableViewProvider } from "../providers";
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

    async execute(command?: LaunchConsumerCommand): Promise<vscode.Uri | undefined> {
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
                ConsumerValidator.validate(command);
                const consumeUri = createConsumerUri(command);
                if (consumer) {
                    if (consumer.uri.toString() === consumeUri.toString()) {
                        return consumer.uri;
                    }

                    await stopConsumerWithProgress(consumer.uri, this.consumerCollection, this.explorer);
                }

                const restartedConsumer = this.consumerCollection.getByConsumerGroupId(command.clusterId, command.consumerGroupId);
                if (restartedConsumer) {
                    await stopConsumerWithProgress(restartedConsumer.uri, this.consumerCollection, this.explorer);
                }

                await startConsumerWithProgress(consumeUri, this.consumerCollection, this.explorer);
                return consumeUri;
            } else {
                if (consumer) {
                    const consumeUri = consumer.uri;
                    await stopConsumerWithProgress(consumeUri, this.consumerCollection, this.explorer);
                }
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error while ${this.start ? 'starting' : 'stopping'} the consumer: ${getErrorMessage(e)}`);
        }
        return undefined;
    }
}

export class StartConsumerCommandHandler extends LaunchConsumerCommandHandler {

    public static commandId = 'vscode-kafka.consumer.start';

    constructor(
        clientAccessor: ClientAccessor,
        consumerCollection: ConsumerCollection,
        explorer: KafkaExplorer,
        private readonly tableViewProvider: ConsumerTableViewProvider
    ) {
        super(clientAccessor, consumerCollection, explorer, true);
    }

    async execute(command?: LaunchConsumerCommand): Promise<vscode.Uri | undefined> {
        const uri = await super.execute(command);
        if (!uri || uri.scheme !== "kafka") {
            return uri;
        }
        await this.tableViewProvider.show(uri);
        return uri;
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

enum ConsumerOption {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Open,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Close,
}

export class ListConsumersCommandHandler {
    private static optionQuickPickItems = [
        {
            label: "Open Message Viewer",
            option: ConsumerOption.Open,
        },
        {
            label: "Close",
            option: ConsumerOption.Close,
        },
    ];

    constructor(private consumerCollection: ConsumerCollection, private tableViewProvider: ConsumerTableViewProvider) {
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
                await this.tableViewProvider.show(pickedConsumer.uri);
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
        private consumerCollection: ConsumerCollection,
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
            // Check if there are any active consumers using this consumer group
            const activeConsumers = this.consumerCollection.getAllByConsumerGroupId(client.cluster.id, consumerGroupToDelete);
            
            let warning = `Are you sure you want to delete consumer group '${consumerGroupToDelete}'?`;
            if (activeConsumers.length > 0) {
                const consumerWord = activeConsumers.length === 1 ? 'consumer' : 'consumers';
                warning += ` ${activeConsumers.length} active ${consumerWord} will be stopped first.`;
            }
            
            const deleteConfirmation = await vscode.window.showWarningMessage(warning, 'Cancel', 'Delete');
            if (deleteConfirmation !== 'Delete') {
                return;
            }

            // Stop all active consumers using this consumer group before deleting
            if (activeConsumers.length > 0) {
                for (const consumer of activeConsumers) {
                    await this.consumerCollection.close(consumer.uri);
                }
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
