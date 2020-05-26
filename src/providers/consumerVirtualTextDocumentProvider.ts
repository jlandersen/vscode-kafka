import { Message } from "kafka-node";
import * as vscode from "vscode";

import { ConsumerCollection } from "../client";
import { CommonMessages } from "../constants";

export class ConsumerVirtualTextDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    public static SCHEME = "kafka";
    private buffer: { [id: string]: string } = {};
    private disposables: vscode.Disposable[] = [];

    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    constructor(private consumerCollection: ConsumerCollection) {
        this.disposables.push(vscode.workspace.onDidCloseTextDocument((e: any) => {
            this.onDidCloseTextDocument(e);
        }));

        this.disposables.push(this.consumerCollection.onDidChangeCollection((arg: any) => {
            for (const startedUri of arg.created) {
                if (!this.buffer[startedUri.toString()]) {
                    this.buffer[startedUri.toString()] = "Consumer: started\n\n";
                } else {
                    this.buffer[startedUri.toString()] += "Consumer started\n\n";
                }

                this.attachToConsumer(startedUri);
            }

            for (const closedUri of arg.closed) {
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

    public attachToConsumer(uri: vscode.Uri): void {
        const consumer = this.consumerCollection.get(uri);

        if (consumer === null) {
            return;
        }

        this.disposables.push(consumer.onDidReceiveRecord((arg: any) => {
            this.onDidReceiveRecord(arg.uri, arg.record);
        }));

        this.disposables.push(consumer.onDidChangeStatus((arg: any) => {
            this.onDidChangeStatus(arg.uri, arg.status);
        }));
    }

    public onDidChangeStatus(uri: vscode.Uri, status: string): void {
        let uriBuffer = this.buffer[uri.toString()];
        const line = `Consumer: ${status}\n\n`;
        uriBuffer = uriBuffer + line;

        this.buffer[uri.toString()] = uriBuffer;
        this.onDidChangeEmitter.fire(uri);
    }

    public onDidReceiveRecord(uri: vscode.Uri, message: Message): void {
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

    public onDidCloseConsumer(uri: vscode.Uri): void {
        let uriBuffer = this.buffer[uri.toString()];

        if (!uriBuffer) {
            return;
        }

        const line = `Consumer closed\n`;
        uriBuffer = uriBuffer + line;

        this.buffer[uri.toString()] = uriBuffer;
        this.onDidChangeEmitter.fire(uri);
    }

    public onDidReceiveError(error: any): void {
        CommonMessages.showUnhandledError(error);
    }

    public onDidCloseTextDocument(document: vscode.TextDocument): void {
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
    }
}