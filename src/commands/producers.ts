import * as faker from "faker";

import { performance } from "perf_hooks";
import { ClientAccessor } from "../client";
import { OutputChannelProvider } from "../providers/outputChannelProvider";
import { KafkaExplorer } from "../explorer";
import { WorkspaceSettings } from "../settings";
import { pickClient } from "./common";

export interface ProduceRecordCommand {
    topicId?: string;
    key?: string;
    value: string
}

export class ProduceRecordCommandHandler {

    public static commandId = 'vscode-kafka.producer.produce';

    constructor(
        private clientAccessor: ClientAccessor,
        private channelProvider: OutputChannelProvider,
        private explorer: KafkaExplorer,
        private settings: WorkspaceSettings
    ) {
    }

    async execute(command: ProduceRecordCommand, times: number): Promise<void> {
        const { topicId, key, value } = command;
        const channel = this.channelProvider.getChannel("Kafka Producer Log");
        if (topicId === undefined) {
            channel.appendLine("No topic");
            return;
        }
        if (this.settings.producerFakerJSEnabled) {
            faker.setLocale(this.settings.producerFakerJSLocale);
        }

        const messages = [...Array(times).keys()].map(() => {
            if (this.settings.producerFakerJSEnabled) {
                //Use same seed for key and value so we can generate content like
                // key: customer-{{random.uuid}} // same value as in id
                // {"id": "{{random.uuid}}"}  // same value as in key
                const seed = Math.floor(Math.random() * 1000000);
                faker.seed(seed);
                const randomizedKey = (key) ? faker.fake(key) : key;
                faker.seed(seed);
                const randomizedValue = faker.fake(value);
                return {
                    key:randomizedKey,
                    value:randomizedValue
                };
            }

            // Return key/value message as-is
            return {
                key:key,
                value:value
            };
        });

        const client = await pickClient(this.clientAccessor);
        if (!client) {
            return;
        }

        const producer = client.producer;
        await producer.connect();

        channel.show(false);
        channel.appendLine(`Producing record(s)`);
        const startOperation = performance.now();

        try {
            await producer.send({
                topic: topicId,
                messages: messages,
            });


            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);

            channel.appendLine(`Produced ${times} record(s) (${elapsed}ms)`);

            this.explorer.refresh();
        } catch (error) {
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
}
