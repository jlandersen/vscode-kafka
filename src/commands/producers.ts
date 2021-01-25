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

        const messages = [...Array(times).keys()].map(() => {
            if (this.settings.producerFakerJSEnabled) {
                //Use same seed for key and value so we can generate content like
                // key: customer-{{random.uuid}} // same value as in id
                // {"id": "{{random.uuid}}"}  // same value as in key
                const seed = Math.floor(Math.random()*1000000);
                faker.seed(seed);
                const randomizedKey = (key)?faker.fake(key):key;
                faker.seed(seed);
                const randomizedValue = faker.fake(value);
                return {
                    key:randomizedKey,
                    value:randomizedValue
                }
            }

            // Return key/value message as-is
            return {
                key:key,
                value:value
            }
        });

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
                messages: messages,
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
