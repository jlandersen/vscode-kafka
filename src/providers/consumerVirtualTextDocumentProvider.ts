import * as vscode from "vscode";

import { ConsumedRecord, ConsumerChangedStatusEvent, ConsumerCollection, ConsumerCollectionChangedEvent, RecordReceivedEvent } from "../client";
import { CommonMessages } from "../constants";

export class ConsumerVirtualTextDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    public static SCHEME = "kafka";
    private buffer: { [id: string]: string } = {};
    private disposables: vscode.Disposable[] = [];

    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    constructor(private consumerCollection: ConsumerCollection) {
        this.disposables.push(vscode.workspace.onDidCloseTextDocument((e: vscode.TextDocument) => {
            this.onDidCloseTextDocument(e);
        }));

        this.disposables.push(this.consumerCollection.onDidChangeCollection((e: ConsumerCollectionChangedEvent) => {
            for (const startedUri of e.created) {
                if (!this.buffer[startedUri.toString()]) {
                    this.buffer[startedUri.toString()] = '';
                }
                this.onDidChangeStatus(startedUri, 'started');
                this.attachToConsumer(startedUri);
            }

            for (const closedUri of e.closed) {
                this.onDidCloseConsumer(closedUri);
            }
        }));
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        if (!this.buffer.hasOwnProperty(uri.toString())) {
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

    private onDidChangeStatus(uri: vscode.Uri, status: string): void {
        let uriBuffer = this.buffer[uri.toString()];
        const line = `Consumer: ${status}\n\n`;
        uriBuffer = uriBuffer + line;

        this.buffer[uri.toString()] = uriBuffer;
        this.onDidChangeEmitter.fire(uri);
    }

    private onDidReceiveRecord(uri: vscode.Uri, message: ConsumedRecord): void {
        let uriBuffer = this.buffer[uri.toString()];

        if (!uriBuffer) {
            return;
        }

        let line = `Key: ${message.key}\nPartition: ${message.partition}\nOffset: ${message.offset}\n`;
        line = line + `Value:\n${message.value}\n\n`;
        uriBuffer = uriBuffer + line;

        this.buffer[uri.toString()] = uriBuffer;
        this.onDidChangeEmitter.fire(uri);
    }

    private onDidCloseConsumer(uri: vscode.Uri): void {
        this.onDidChangeStatus(uri, 'closed');
    }

    private onDidReceiveError(error: any): void {
        CommonMessages.showUnhandledError(error);
    }

    private onDidCloseTextDocument(document: vscode.TextDocument): void {
        if (document.uri.scheme !== "kafka") {
            return;
        }

        const buffer = this.buffer[document.uri.toString()];

        if (!buffer) {
            return;
        }

        if (this.consumerCollection.has(document.uri)) {
            this.consumerCollection.close(document.uri);
        }

        delete this.buffer[document.uri.toString()];
    }

    public dispose(): void {
        this.consumerCollection.dispose();
        this.disposables.forEach(d=>d.dispose());
    }
}
