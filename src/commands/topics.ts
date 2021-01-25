import { ClusterSettings } from "../settings";
import { dump } from "js-yaml";
import * as vscode from "vscode";

import { Topic, ClientAccessor } from "../client";
import { KafkaExplorer, TopicItem } from "../explorer";
import { OutputChannelProvider } from "../providers";
import { addTopicWizard } from "../wizards/topics";
import { pickClient, pickTopic } from "./common";

const AUTO_CREATE_TOPIC_KEY = 'auto.create.topics.enable';

export class CreateTopicCommandHandler {

    constructor(private clientAccessor: ClientAccessor, private clusterSettings: ClusterSettings, private explorer: KafkaExplorer) {
    }

    async execute(clusterId?: string): Promise<void> {
        addTopicWizard(this.clientAccessor, this.clusterSettings, this.explorer, clusterId);
    }
}

export class DumpTopicMetadataCommandHandler {
    constructor(private clientAccessor: ClientAccessor, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute(topic?: TopicItem): Promise<void> {
        const client = await pickClient(this.clientAccessor, topic?.clusterId);
        if (!client) {
            return;
        }

        const topicToDump: Topic | undefined = topic ? topic.topic : await pickTopic(client);

        if (!topicToDump) {
            return;
        }

        const configs = await client.getTopicConfigs(topicToDump.id);
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

export class DeleteTopicCommandHandler {

    public static commandId = 'vscode-kafka.topic.delete';

    constructor(private clientAccessor: ClientAccessor, private explorer: KafkaExplorer) {
    }

    async execute(topic?: TopicItem): Promise<void> {
        const client = await pickClient(this.clientAccessor, topic?.clusterId);
        if (!client) {
            return;
        }

        //TODO implement multiple topic deletion
        const topicToDelete: Topic | undefined = topic?.topic || await pickTopic(client);

        if (!topicToDelete) {
            return;
        }

        try {
            const brokers = await client?.getBrokers();
            let autoCreateTopicsEnabled = false;

            if (brokers) {
                for (let i = 0; i < brokers.length && !autoCreateTopicsEnabled; i++) {
                    const configs = await client?.getBrokerConfigs(brokers[i].id);
                    const config = configs?.find(ce => ce.configName === AUTO_CREATE_TOPIC_KEY);
                    if (config) {
                        autoCreateTopicsEnabled = config.configValue === 'true';
                    }
                }
            }

            let warning = `Are you sure you want to delete topic '${topicToDelete.id}'?`;
            if (autoCreateTopicsEnabled) {
                warning += ` The cluster is configured with '${AUTO_CREATE_TOPIC_KEY}=true', so the topic might be recreated automatically.`;
            }
            const deleteConfirmation = await vscode.window.showWarningMessage(warning, 'Cancel', 'Delete');
            if (deleteConfirmation !== 'Delete') {
                return;
            }

            await client.deleteTopic({ topics: [topicToDelete.id] });
            this.explorer.refresh();
            vscode.window.showInformationMessage(`Topic '${topicToDelete.id}' deleted successfully`);
        } catch (error) {
            if (error.message) {
                vscode.window.showErrorMessage(error.message);
            } else {
                vscode.window.showErrorMessage(error);
            }
        }
    }
}
