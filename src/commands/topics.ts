import { dump } from "js-yaml";
import * as vscode from "vscode";

import { Client, Topic } from "../client";
import { KafkaExplorer, TopicItem } from "../explorer";
import { OutputChannelProvider } from "../providers";
import { pickTopic } from "./common";

export class CreateTopicCommandHandler {
    constructor(private client: Client, private explorer: KafkaExplorer) {
    }

    private validatePositiveNumber(value?: string): string | undefined {
        if (!value) {
            return "Must be a positive number";
        }

        const valueAsNumber = parseInt(value, 10);

        if (isNaN(valueAsNumber) || valueAsNumber < 1) {
            return "Must be a positive number";
        }
    }

    async execute(): Promise<void> {
        const topic = await vscode.window.showInputBox({ placeHolder: "Topic name" });

        if (!topic) {
            return;
        }

        const partitions = await vscode.window.showInputBox({
            placeHolder: "Number of partitions",
            validateInput: this.validatePositiveNumber,
        });

        if (!partitions) {
            return;
        }

        const replicationFactor = await vscode.window.showInputBox({
            placeHolder: "Replication Factor",
            validateInput: this.validatePositiveNumber,
        });

        if (!replicationFactor) {
            return;
        }

        try {
            const result = await this.client.createTopic({
                topic,
                partitions: parseInt(partitions, 10),
                replicationFactor: parseInt(replicationFactor, 10),
            });

            if (result.length > 0) {
                vscode.window.showErrorMessage(result[0].error);
            } else {
                this.explorer.refresh();
                vscode.window.showInformationMessage(`Topic ${topic} created successfully`);
            }
        } catch (error) {
            if (error.message) {
                vscode.window.showErrorMessage(error.message);
            } else {
                vscode.window.showErrorMessage(error);
            }
        }
    }
}

export class DumpTopicMetadataCommandHandler {
    constructor(private client: Client, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute(topic?: TopicItem): Promise<void> {
        const topicToDump: Topic | undefined = topic ? topic.topic : await pickTopic(this.client);

        if (!topicToDump) {
            return;
        }

        const configs = await this.client.getTopicConfigs(topicToDump.id);
        const data = {
            ...topicToDump,
            configs,
        };

        const channel = this.outputChannelProvider.getChannel("Topic Metadata");
        channel.clear();
        channel.append(dump(data));
        channel.show();
    }
}
