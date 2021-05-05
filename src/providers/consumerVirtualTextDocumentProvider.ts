import * as vscode from "vscode";

import { ConsumedRecord, Consumer, ConsumerChangedStatusEvent, ConsumerCollection, ConsumerCollectionChangedEvent, ConsumerLaunchState, RecordReceivedEvent } from "../client";
import { SerializationSetting } from "../client/serialization";
import { CommonMessages } from "../constants";
import { ClusterSettings } from "../settings/clusters";

export class ConsumerVirtualTextDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static SCHEME = "kafka";
    private buffer: { [id: string]: string } = {};
    private disposables: vscode.Disposable[] = [];

    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    constructor(private consumerCollection: ConsumerCollection, private clusterSettings: ClusterSettings) {
        this.disposables.push(vscode.workspace.onDidCloseTextDocument((e: vscode.TextDocument) => {
            this.onDidCloseTextDocument(e);
        }));

        this.disposables.push(this.consumerCollection.onDidChangeCollection((e: ConsumerCollectionChangedEvent) => {
            for (const consumer of e.consumers) {
                const uri = consumer.uri;
                switch (consumer.state) {
                    case ConsumerLaunchState.starting:
                        if (!this.buffer[uri.toString()]) {
                            this.buffer[uri.toString()] = '';
                            this.displayConsumerOptions(consumer);
                        }
                        this.onDidChangeStatus(uri, 'starting...');
                        this.attachToConsumer(uri);
                        break;
                    case ConsumerLaunchState.started:
                        this.onDidChangeStatus(uri, 'started');
                        break;
                    case ConsumerLaunchState.closed:
                        this.onDidCloseConsumer(uri);
                    default:
                        if (consumer.error) {
                            this.onDidConsumerError(uri, consumer.error);
                        }
                        break;
                }
            }
        }));
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        if (!this.isActive(uri)) {
            return "";
        }
        return this.buffer[uri.toString()];
    }

    private attachToConsumer(uri: vscode.Uri): void {
        const consumer = this.consumerCollection.get(uri);

        if (consumer === null) {
            return;
        }

        this.disposables.push(consumer.onDidReceiveRecord((e: RecordReceivedEvent) => {
            this.onDidReceiveRecord(e.uri, e.record);
        }));

        this.disposables.push(consumer.onDidChangeStatus((e: ConsumerChangedStatusEvent) => {
            this.onDidChangeStatus(e.uri, e.status);
        }));

        this.disposables.push(consumer.onDidReceiveError((e: any) => {
            this.onDidReceiveError(e);
        }));
    }

    private displayConsumerOptions(consumer: Consumer): void {
        let line = `Consumer options:\n`;
        const clusterName = this.clusterSettings.get(consumer.clusterId)?.name;
        if (clusterName) {
            line += `  - cluster: ${clusterName}\n`;
        }
        line += `  - bootstrap: ${consumer.options.bootstrap}\n`;
        line += `  - consumer group id: ${consumer.options.consumerGroupId}\n`;
        line += `  - topic: ${consumer.options.topicId}\n`;
        line += `  - from: ${consumer.options.fromOffset}\n`;
        if (consumer.options.partitions) {
            line += `  - partitions: ${consumer.options.partitions}\n`;
        }
        if (consumer.options.messageKeyFormat) {
            line += `  - key format: ${consumer.options.messageKeyFormat}${this.getFormatSettings(consumer.options.messageKeyFormatSettings)}\n`;
        }
        if (consumer.options.messageValueFormat) {
            line += `  - value format: ${consumer.options.messageValueFormat}${this.getFormatSettings(consumer.options.messageValueFormatSettings)}\n`;
        }
        line += `\n`;
        this.updateBuffer(consumer.uri, line);
    }

    getFormatSettings(messageKeyFormatSettings: SerializationSetting[] | undefined) {
        if (!messageKeyFormatSettings) {
            return '';
        }
        return `(${messageKeyFormatSettings.map(s => s.value).join(',')})`;
    }

    onDidConsumerError(uri: vscode.Uri, error: any): void {
        if (!this.isActive(uri)) {
            return;
        }
        const line = `Error: ${error}\n\n`;
        this.updateBuffer(uri, line);
    }

    private onDidChangeStatus(uri: vscode.Uri, status: string): void {
        if (!this.isActive(uri)) {
            return;
        }
        const line = `Consumer: ${status}\n\n`;
        this.updateBuffer(uri, line);
    }

    private onDidReceiveRecord(uri: vscode.Uri, message: ConsumedRecord): void {
        if (!this.isActive(uri)) {
            return;
        }
        let line = `Key: ${message.key}\nPartition: ${message.partition}\nOffset: ${message.offset}\n`;
        line = line + `Value:\n${message.value}\n\n`;
        this.updateBuffer(uri, line);
    }

    private onDidCloseConsumer(uri: vscode.Uri): void {
        this.onDidChangeStatus(uri, 'closed');
    }

    private onDidReceiveError(error: any): void {
        CommonMessages.showUnhandledError(error);
    }

    private onDidCloseTextDocument(document: vscode.TextDocument): void {
        // When language is plaintext we assume the event was triggered as a result of switching language mode
        const uri = document.uri;
        if (uri.scheme !== "kafka" || document.languageId === "plaintext") {
            return;
        }

        if (!this.isActive(uri)) {
            return;
        }

        if (this.consumerCollection.has(uri)) {
            this.consumerCollection.close(uri);
        }

        delete this.buffer[uri.toString()];
    }

    public clear(document: vscode.TextDocument): void {
        const uri = document.uri;
        if (!this.isActive(uri)) {
            return;
        }
        this.updateBuffer(uri, '', true);
    }

    public dispose(): void {
        this.consumerCollection.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    private isActive(uri: vscode.Uri): boolean {
        return this.buffer.hasOwnProperty(uri.toString());
    }

    private updateBuffer(uri: vscode.Uri, content: string, replace = false) {
        if (replace) {
            this.buffer[uri.toString()] = content;
        } else {
            const uriBuffer = this.buffer[uri.toString()];
            this.buffer[uri.toString()] = uriBuffer + content;
        }
        this.onDidChangeEmitter.fire(uri);
    }
}
