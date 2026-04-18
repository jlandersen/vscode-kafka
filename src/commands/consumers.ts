import * as vscode from "vscode";

import { pickClient, pickConsumerGroupId, pickTopic } from "./common";
import { ConsumerCollection, ClientAccessor, createConsumerUri, ConsumerInfoUri, ConsumerLaunchState, ConsumerGroupOffset, ConsumerGroup } from "../client";
import { KafkaExplorer } from "../explorer";
import { ConsumerTableViewProvider } from "../providers";
import { ProgressLocation, window } from "vscode";
import { getErrorMessage } from "../errors";
import { ConsumerValidator } from "../validators/consumer";
import { getNonce } from "../webviewUtils";

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

export interface EditConsumerGroupOffsetsCommand {
    clusterId: string;
    consumerGroupId: string;
}

type OffsetsWebviewMessage = {
    command: 'submitOffsets';
    offsets: { topic: string; partition: number; offset: string }[];
};

export class EditConsumerGroupOffsetsCommandHandler implements vscode.Disposable {

    public static commandId = 'vscode-kafka.consumer.editoffsets';

    private panels = new Map<string, vscode.WebviewPanel>();

    constructor(
        private clientAccessor: ClientAccessor,
        private explorer: KafkaExplorer,
        private extensionUri: vscode.Uri
    ) {
    }

    async execute(command?: EditConsumerGroupOffsetsCommand): Promise<void> {
        const client = await pickClient(this.clientAccessor, command?.clusterId);
        if (!client) {
            return;
        }

        const groupId: string | undefined = command?.consumerGroupId || await pickConsumerGroupId(client);
        if (!groupId) {
            return;
        }

        let groupDetails: ConsumerGroup;
        try {
            groupDetails = await client.getConsumerGroupDetails(groupId);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load consumer group details: ${getErrorMessage(error)}`);
            return;
        }

        if (groupDetails.offsets.length === 0) {
            vscode.window.showWarningMessage(`Consumer group '${groupId}' has no committed offsets to edit.`);
            return;
        }

        const offsets = groupDetails.offsets.sort((a, b) => {
            const tc = a.topic.localeCompare(b.topic);
            if (tc !== 0) { return tc; }
            return a.partition - b.partition;
        });

        const existing = this.panels.get(groupId);
        if (existing) {
            existing.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'kafkaEditOffsets',
            `Edit Offsets: ${groupId}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "webview-resources")]
            }
        );
        this.panels.set(groupId, panel);

        panel.webview.html = this.getWebviewContent(panel.webview, groupId, groupDetails.state, offsets);

        const messageListener = panel.webview.onDidReceiveMessage(async (message: OffsetsWebviewMessage) => {
            if (message.command !== 'submitOffsets') {
                return;
            }

            const changed = message.offsets;
            if (!changed || changed.length === 0) {
                vscode.window.showWarningMessage('No offsets were changed.');
                return;
            }

            try {
                await window.withProgress({
                    location: ProgressLocation.Window,
                    title: `Setting offsets for '${groupId}'...`,
                    cancellable: false,
                }, async () => {
                    await client.setConsumerGroupOffsets(groupId, changed);
                });

                this.explorer.refresh();
                panel.dispose();
                vscode.window.showInformationMessage(
                    `Updated ${changed.length} partition offset(s) for '${groupId}' successfully`
                );
            } catch (error) {
                panel.webview.postMessage({ command: 'error', message: getErrorMessage(error) });
                vscode.window.showErrorMessage(`Error setting consumer group offsets: ${getErrorMessage(error)}`);
            }
        });

        panel.onDidDispose(() => {
            messageListener.dispose();
            this.panels.delete(groupId);
        });
    }

    private getWebviewContent(webview: vscode.Webview, groupId: string, state: string, offsets: ConsumerGroupOffset[]): string {
        const nonce = getNonce();
        const stylesheetUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview-resources", "edit-consumer-group-offsets.css"));
        const fmtCell = (val: string) => val === '?'
            ? `<span class="unavailable">N/A</span>`
            : this.escapeHtml(val);

        const rowsHtml = offsets.map((o, i) => `
            <tr>
                <td>${this.escapeHtml(o.topic)}</td>
                <td>${this.escapeHtml(String(o.partition))}</td>
                <td class="num">${fmtCell(o.start)}</td>
                <td class="num">${fmtCell(o.end)}</td>
                <td class="num">${this.escapeHtml(o.offset)}</td>
                <td class="num">${fmtCell(o.lag)}</td>
                <td>
                    <input type="text" class="offset-input" id="offset-${i}"
                           data-topic="${this.escapeHtml(o.topic)}"
                           data-partition="${this.escapeHtml(String(o.partition))}"
                           data-original="${this.escapeHtml(o.offset)}"
                           placeholder="${this.escapeHtml(o.offset)}" />
                </td>
            </tr>`).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Offsets: ${this.escapeHtml(groupId)}</title>
    <link rel="stylesheet" type="text/css" href="${stylesheetUri.toString()}">
</head>
<body>
    <h2>Edit Consumer Group Offsets</h2>
    <div class="subtitle">
        Group: <strong>${this.escapeHtml(groupId)}</strong>
        &nbsp;&middot;&nbsp;
        State: ${this.escapeHtml(state)}
        <span id="changedCount" class="changed-count"></span>
    </div>

    <div class="toolbar">
        <button id="fillEarliest" title="Set all to earliest (start) offset">Fill Earliest</button>
        <button id="fillLatest" title="Set all to latest (end) offset">Fill Latest</button>
        <button id="clearAll" title="Clear all new offset values">Clear All</button>
        <span class="toolbar-spacer"></span>
        <button id="submit">Apply Offsets</button>
    </div>

    <div id="errorBar" class="error-bar"></div>

    <table>
        <thead>
            <tr>
                <th>Topic</th>
                <th>Partition</th>
                <th>Start</th>
                <th>End</th>
                <th>Current Offset</th>
                <th>Lag</th>
                <th class="new-offset-column">New Offset</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const inputs = document.querySelectorAll('.offset-input');
        const submitBtn = document.getElementById('submit');
        const changedCountEl = document.getElementById('changedCount');
        const errorBarEl = document.getElementById('errorBar');

        function getStartOffset(input) {
            return input.closest('tr').children[2].textContent.trim();
        }

        function getEndOffset(input) {
            return input.closest('tr').children[3].textContent.trim();
        }

        function isAvailable(val) {
            return val !== '' && val !== 'N/A' && /^\\d+$/.test(val);
        }

        function updateChangedCount() {
            let count = 0;
            inputs.forEach(input => {
                const val = input.value.trim();
                const isChanged = val !== '' && val !== input.dataset.original;
                input.classList.toggle('changed', isChanged);
                const isValid = val === '' || /^\\d+$/.test(val);
                input.classList.toggle('invalid', !isValid && val !== '');
                if (isChanged) { count++; }
            });
            if (count > 0) {
                changedCountEl.textContent = count + ' changed';
                changedCountEl.style.display = 'inline';
            } else {
                changedCountEl.style.display = 'none';
            }
        }

        inputs.forEach(input => {
            input.addEventListener('input', updateChangedCount);
        });

        document.getElementById('fillEarliest').addEventListener('click', () => {
            inputs.forEach(input => {
                const val = getStartOffset(input);
                if (isAvailable(val)) { input.value = val; }
            });
            updateChangedCount();
        });

        document.getElementById('fillLatest').addEventListener('click', () => {
            inputs.forEach(input => {
                const val = getEndOffset(input);
                if (isAvailable(val)) { input.value = val; }
            });
            updateChangedCount();
        });

        document.getElementById('clearAll').addEventListener('click', () => {
            inputs.forEach(input => { input.value = ''; });
            updateChangedCount();
        });

        submitBtn.addEventListener('click', () => {
            const offsets = [];
            let hasInvalid = false;

            inputs.forEach(input => {
                const val = input.value.trim();
                if (val === '' || val === input.dataset.original) {
                    return;
                }
                if (!/^\\d+$/.test(val)) {
                    hasInvalid = true;
                    return;
                }
                offsets.push({
                    topic: input.dataset.topic,
                    partition: Number(input.dataset.partition),
                    offset: val
                });
            });

            if (hasInvalid) {
                errorBarEl.textContent = 'Some offset values are invalid. Offsets must be non-negative integers.';
                errorBarEl.style.display = 'block';
                return;
            }
            errorBarEl.style.display = 'none';

            if (offsets.length === 0) {
                errorBarEl.textContent = 'No offsets were changed. Enter new values in the "New Offset" column.';
                errorBarEl.style.display = 'block';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Applying...';
            vscode.postMessage({ command: 'submitOffsets', offsets });
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.command === 'error') {
                errorBarEl.textContent = msg.message;
                errorBarEl.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Apply Offsets';
            }
        });
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    dispose(): void {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.panels.clear();
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
