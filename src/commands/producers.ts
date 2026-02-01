import * as vscode from "vscode";
import { allFakers, Faker } from "@faker-js/faker";

import { performance } from "perf_hooks";
import { ClientAccessor } from "../client";
import { OutputChannelProvider } from "../providers/outputChannelProvider";
import { KafkaExplorer } from "../explorer";
import { WorkspaceSettings } from "../settings";
import { pickClient } from "./common";
import { MessageFormat, SerializationSetting, serialize } from "../client/serialization";
import { createProducerUri, ProducerCollection, ProducerInfoUri, ProducerLaunchState } from "../client/producer";
import { IHeaders, ProducerRecord } from "kafkajs";
import { ProducerValidator } from "../validators/producer";
import { getErrorMessage } from "../errors";

/**
 * Process custom template helpers that are not part of FakerJS.
 * These helpers are prefixed with $ to distinguish them from faker methods.
 * Exported for testing purposes.
 */
export function processCustomHelpers(template: string): string {
    // Replace {{$timestamp}} with current timestamp in milliseconds
    template = template.replace(/\{\{\$timestamp\}\}/g, () => Date.now().toString());
    
    // Replace {{$date.now}} with current timestamp in milliseconds
    template = template.replace(/\{\{\$date\.now\}\}/g, () => Date.now().toString());
    
    // Replace {{$date.iso}} with ISO 8601 formatted current date
    template = template.replace(/\{\{\$date\.iso\}\}/g, () => new Date().toISOString());
    
    // Replace {{$date.unix}} with Unix timestamp in seconds
    template = template.replace(/\{\{\$date\.unix\}\}/g, () => Math.floor(Date.now() / 1000).toString());
    
    return template;
}

export interface ProduceRecordCommand extends ProducerInfoUri {
    messageKeyFormat?: MessageFormat;
    messageKeyFormatSettings?: SerializationSetting[];
    messageValueFormat?: MessageFormat;
    messageValueFormatSettings?: SerializationSetting[];
}

export class ProduceRecordCommandHandler {

    public static commandId = 'vscode-kafka.producer.produce';

    constructor(
        private clientAccessor: ClientAccessor,
        private producerCollection: ProducerCollection,
        private channelProvider: OutputChannelProvider,
        private explorer: KafkaExplorer,
        private settings: WorkspaceSettings
    ) {
    }

    async execute(command: ProduceRecordCommand, times: number): Promise<void> {
        const client = await pickClient(this.clientAccessor);
        if (!client) {
            return;
        }

        try {
            ProducerValidator.validate(command);

            const { topicId, key, value, headers } = command;
            const channel = this.channelProvider.getChannel("Kafka Producer Log");
            if (topicId === undefined) {
                channel.appendLine("No topic");
                return;
            }
            if (value === undefined) {
                channel.appendLine("No value");
                return;
            }
            // Get the faker instance for the configured locale (defaults to 'en')
            const faker: Faker = this.settings.producerFakerJSEnabled
                ? (allFakers[this.settings.producerFakerJSLocale as keyof typeof allFakers] ?? allFakers.en)
                : allFakers.en;

            const messages = [...Array(times).keys()].map(() => {

                const messageHeaders: IHeaders = {};
                headers?.forEach((val, idx) => {
                    messageHeaders[idx] = val;
                });

                if (this.settings.producerFakerJSEnabled) {
                    //Use same seed for key and value so we can generate content like
                    // key: customer-{{string.uuid}} // same value as in id
                    // {"id": "{{string.uuid}}"}  // same value as in key
                    const seed = Math.floor(Math.random() * 1000000);
                    faker.seed(seed);
                    // Process custom helpers before faker processing
                    const processedKey = key ? processCustomHelpers(key) : key;
                    const processedValue = processCustomHelpers(value);
                    const randomizedKey = processedKey ? faker.helpers.fake(processedKey) : processedKey;
                    faker.seed(seed);
                    const randomizedValue = faker.helpers.fake(processedValue);
                    if (headers && headers.size > 0) {
                        Object.keys(messageHeaders).forEach(val => {
                            faker.seed(seed);
                            const processedHeader = processCustomHelpers(messageHeaders[val] as string);
                            messageHeaders[val] = faker.helpers.fake(processedHeader);
                        });
                    }
                    return {
                        key: serialize(randomizedKey, command.messageKeyFormat, command.messageKeyFormatSettings),
                        value: serialize(randomizedValue, command.messageValueFormat, command.messageValueFormatSettings),
                        headers: messageHeaders
                    };
                }

                // Return key/value message as-is
                return {
                    key: serialize(key, command.messageKeyFormat, command.messageKeyFormatSettings),
                    value: serialize(value, command.messageValueFormat, command.messageValueFormatSettings),
                    headers: messageHeaders
                };
            });

            command.clusterId = client.cluster.id;
            const producerUri = createProducerUri(command);
            const record = {
                topic: topicId,
                messages: messages,
            };
            // Start the producer
            await startProducerWithProgress(producerUri, record, this.producerCollection, channel, times, this.explorer);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Error while producing: ${getErrorMessage(e)}`);
        }
    }
}

async function startProducerWithProgress(producerUri: vscode.Uri, record: ProducerRecord, producerCollection: ProducerCollection, channel: vscode.OutputChannel, times: number, explorer?: KafkaExplorer) {

    function isBusy(state: ProducerLaunchState) {
        return state === ProducerLaunchState.connecting || state === ProducerLaunchState.sending;
    }

    const producer = producerCollection.get(producerUri);
    if (producer && !isBusy(producer.state)) {
        vscode.window.showErrorMessage(`The producer cannot be started because it is producing.`);
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `Starting producer '${producerUri}'.`,
        cancellable: false
    }, async (progress, token) => {

        // 1. Connect the producer
        progress.report({ message: `Connecting producer '${producerUri}'.`, increment: 30 });
        await producerCollection.create(producerUri);

        // 2. Send the producer record.
        progress.report({ message: `Producing record(s) '${producerUri}'.`, increment: 30 });
        channel.appendLine(`Producing record(s)`);
        const startOperation = performance.now();

        try {
            await producerCollection.send(producerUri, record);

            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);

            channel.appendLine(`Produced ${times} record(s) (${elapsed}ms)`);
            if (explorer) {
                explorer.refresh();
            }
        } catch (error: any) {
            const finishedOperation = performance.now();
            const elapsed = (finishedOperation - startOperation).toFixed(2);
            channel.appendLine(`Failed to produce record(s) (${elapsed}ms)`);

            if (error.message) {
                channel.appendLine(`Error: ${error.message}`);
            } else {
                channel.appendLine(`Error: ${error}`);
            }
            throw error;
        }
        finally {
            // 3. Close the producer
            progress.report({ message: `Closing producer '${producerUri}'.`, increment: 40 });
            await producerCollection.close(producerUri);
        }
    });
}
