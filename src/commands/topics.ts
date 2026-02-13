import * as vscode from "vscode";
import { dump } from "js-yaml";
import { ClusterSettings } from "../settings";
import { Topic, ClientAccessor } from "../client";
import { KafkaExplorer, TopicItem } from "../explorer";
import { OutputChannelProvider } from "../providers";
import { addTopicWizard } from "../wizards/topics";
import { pickClient, pickTopic, pickTopics } from "./common";
import { BrokerConfigs } from "../client/config";
import { getErrorMessage } from "../errors";

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

    async execute(topic?: TopicItem | TopicItem[]): Promise<void> {
        const topicsToDelete = await this.resolveTopicsToDelete(topic);
        if (topicsToDelete.length === 0) {
            return;
        }

        const topicsByClusterId = new Map<string, string[]>();
        for (const topicToDelete of topicsToDelete) {
            const topicIds = topicsByClusterId.get(topicToDelete.clusterId);
            if (topicIds) {
                topicIds.push(topicToDelete.topicId);
            } else {
                topicsByClusterId.set(topicToDelete.clusterId, [topicToDelete.topicId]);
            }
        }

        try {
            const autoCreateEnabledClusters: string[] = [];
            for (const [clusterId] of topicsByClusterId) {
                const client = await pickClient(this.clientAccessor, clusterId);
                if (!client) {
                    return;
                }
                const autoCreateTopicsEnabled = await BrokerConfigs.getAutoCreateTopicEnabled(client);
                if (autoCreateTopicsEnabled.type === "enabled") {
                    autoCreateEnabledClusters.push(client.cluster.name);
                }
            }

            const topicIds = topicsToDelete.map(topicToDelete => topicToDelete.topicId);
            const topicsDescription = topicIds.length === 1
                ? `topic '${topicIds[0]}'`
                : `${topicIds.length} topics (${topicIds.map(topicId => `'${topicId}'`).join(', ')})`;
            let warning = `Are you sure you want to delete ${topicsDescription}?`;
            if (autoCreateEnabledClusters.length > 0) {
                const clusters = autoCreateEnabledClusters.map(cluster => `'${cluster}'`).join(', ');
                warning += ` Cluster${autoCreateEnabledClusters.length === 1 ? '' : 's'} ${clusters} ${autoCreateEnabledClusters.length === 1 ? 'is' : 'are'} configured with '${BrokerConfigs.AUTO_CREATE_TOPIC_ENABLE}=true', so deleted topics might be recreated automatically.`;
            }

            const deleteConfirmation = await vscode.window.showWarningMessage(warning, 'Cancel', 'Delete');
            if (deleteConfirmation !== 'Delete') {
                return;
            }

            for (const [clusterId, clusterTopicIds] of topicsByClusterId) {
                const client = await pickClient(this.clientAccessor, clusterId);
                if (!client) {
                    return;
                }
                await client.deleteTopic({ topics: clusterTopicIds });
            }

            this.explorer.refresh();
            if (topicIds.length === 1) {
                vscode.window.showInformationMessage(`Topic '${topicIds[0]}' deleted successfully`);
            } else {
                vscode.window.showInformationMessage(`${topicIds.length} topics deleted successfully`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error deleting topic: ${getErrorMessage(error)}`);
        }
    }

    private async resolveTopicsToDelete(topic?: TopicItem | TopicItem[]): Promise<{ clusterId: string; topicId: string; }[]> {
        if (Array.isArray(topic)) {
            return topic.map(topicItem => ({
                clusterId: topicItem.clusterId,
                topicId: topicItem.topic.id
            }));
        }

        if (topic?.topic) {
            return [{
                clusterId: topic.clusterId,
                topicId: topic.topic.id
            }];
        }

        const client = await pickClient(this.clientAccessor);
        if (!client) {
            return [];
        }

        const pickedTopics: Topic[] | undefined = await pickTopics(client);
        if (!pickedTopics || pickedTopics.length === 0) {
            return [];
        }

        return pickedTopics.map(pickedTopic => ({
            clusterId: client.cluster.id,
            topicId: pickedTopic.id
        }));
    }
}

export class DeleteTopicRecordsCommandHandler {

    public static commandId = 'vscode-kafka.topic.deleterecords';

    constructor(private clientAccessor: ClientAccessor, private explorer: KafkaExplorer) {
    }

    async execute(topic?: TopicItem): Promise<void> {
        const client = await pickClient(this.clientAccessor, topic?.clusterId);
        if (!client) {
            return;
        }

        const topicToEmpty: Topic | undefined = topic?.topic || await pickTopic(client);

        if (!topicToEmpty) {
            return;
        }

        try {
            // Ask for confirmation
            const emptyConfirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to delete all records from topic '${topicToEmpty.id}'? This operation cannot be undone.`,
                'Cancel',
                'Delete Records'
            );
            if (emptyConfirmation !== 'Delete Records') {
                return;
            }

            // Get all partition offsets for the topic
            const offsets = await client.fetchTopicOffsets(topicToEmpty.id);
            
            // Delete records by setting offset to the high watermark (latest offset) for each partition
            // This effectively deletes all records up to the current high watermark
            const partitions = offsets.map(offset => ({
                partition: parseInt(offset.partition.toString(), 10),
                offset: offset.high
            }));

            await client.deleteTopicRecords(topicToEmpty.id, partitions);
            this.explorer.refresh();
            vscode.window.showInformationMessage(`All records deleted from topic '${topicToEmpty.id}'`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error deleting topic records: ${getErrorMessage(error)}`);
        }
    }
}
