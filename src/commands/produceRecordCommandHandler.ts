import * as kafka from "kafka-node";
import * as vscode from "vscode";

import { performance } from "perf_hooks";
import { Client } from "../client";
import { OutputChannelProvider } from "../providers/outputChannelProvider";

export class ProduceRecordCommandHandler {
    constructor(private client: Client, private channelProvider: OutputChannelProvider) {
    }

    async execute(document: vscode.TextDocument, range: vscode.Range, times: number) {
        const { topic, key, value } = this.parseDocumentRange(document, range);
        const producer = new kafka.HighLevelProducer(this.client.kafkaClient);
        const messages = [...Array(times).keys()].map(() => value);

        const channel = this.channelProvider.getChannel("Kafka Producer Log");
        channel.show(false);

        channel.appendLine(`Producing record(s)`);
        const startOperation = performance.now();

        producer.send([{
            topic,
            attributes: 0,
            key,
            messages,
        }], (error, result) => {
            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);

            if (error) {
                channel.appendLine(`Failed to produce record(s) (${elapsed}ms)`);

                if (error.message) {
                    channel.appendLine(`Error: ${error.message}`);
                } else {
                    channel.appendLine(`Error: ${error}`);
                }

                return;
            }

            channel.appendLine(`Produced ${times} record(s) (${elapsed}ms)`);
        });
    }

    private parseDocumentRange(document: vscode.TextDocument, range: vscode.Range) {
        let topic = "";
        let key = "";
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
