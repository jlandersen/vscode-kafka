import * as vscode from "vscode";
import * as faker from "faker";

import { performance } from "perf_hooks";
import { ClientAccessor } from "../client";
import { OutputChannelProvider } from "../providers/outputChannelProvider";
import { KafkaExplorer } from "../explorer";
import { WorkspaceSettings } from "../settings";

export class ProduceRecordCommandHandler {
    constructor(
        private clientAccessor: ClientAccessor, 
        private channelProvider: OutputChannelProvider,
        private explorer: KafkaExplorer,
        private settings: WorkspaceSettings
        ) {
    }

    async execute(document: vscode.TextDocument, range: vscode.Range, times: number): Promise<void> {
        const channel = this.channelProvider.getChannel("Kafka Producer Log");
        const { topic, key, value } = this.parseDocumentRange(document, range);
        if(this.settings.producerFakerJSEnabled) {
            faker.setLocale(this.settings.producerFakerJSLocale);
        }
        const messages = [...Array(times).keys()].map(() => this.settings.producerFakerJSEnabled?
                                                            faker.fake(value):value);

        if (topic === undefined) {
            channel.appendLine("No topic");
            return;
        }

        const client = this.clientAccessor.getSelectedClusterClient();

        if (!client) {
            vscode.window.showWarningMessage("No cluster selected");
            return;
        }

        const producer = client.producer;
        await producer.connect();

        channel.show(false);
        channel.appendLine(`Producing record(s)`);
        const startOperation = performance.now();
        
        try {
            await producer.send({
                topic: topic,
                messages: messages.map((m) => ({ key: key, value: m })),
            });


            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);

            channel.appendLine(`Produced ${times} record(s) (${elapsed}ms)`);

            this.explorer.refresh();
        } catch(error) {
            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);
            channel.appendLine(`Failed to produce record(s) (${elapsed}ms)`);

            if (error.message) {
                channel.appendLine(`Error: ${error.message}`);
            } else {
                channel.appendLine(`Error: ${error}`);
            }
        }
    }

    private parseDocumentRange(document: vscode.TextDocument, range: vscode.Range): { topic?: string; key?: string; value: string } {
        let topic;
        let key;
        let value = "";
        for (let currentLine = range.start.line + 1; currentLine <= range.end.line; currentLine++) {
            const line = document.lineAt(currentLine);

            if (line.text.startsWith("topic:")) {
                topic = line.text.substr("topic:".length).trim();
                continue;
            }

            if (line.text.startsWith("key:")) {
                key = line.text.substr("key:".length).trim();
                continue;
            }

            if (line.text.startsWith("--")) {
                continue;
            }

            value = document.getText(new vscode.Range(currentLine, 0, range.end.line + 1, 0)).trim();
            break;
        }

        return {
            topic,
            key,
            value,
        };
    }
}
