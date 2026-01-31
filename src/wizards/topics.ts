import { ClusterSettings } from "../settings";
import { QuickPickItem, window } from "vscode";
import { ClientAccessor } from "../client";
import { INPUT_TITLE } from "../constants";
import { KafkaExplorer } from "../explorer/kafkaExplorer";
import { MultiStepInput, showErrorMessage, State } from "./multiStepInput";
import { validateTopicName, validatePartitions, validateReplicationFactor } from "./validators";
import { BrokerConfigs } from "../client/config";

const DEFAULT_PARTITIONS = 1;
interface CreateTopicState extends State {
    clusterId: string;
    topicName: string;
    partitions: string;
    replicationFactor: string;
    defaultReplicas: number;
    maxReplicas: number;
}

export async function addTopicWizard(clientAccessor: ClientAccessor, clusterSettings: ClusterSettings, explorer: KafkaExplorer, clusterId?: string): Promise<void> {
    const clusters = clusterSettings.getAll();
    if (clusters.length === 0) {
        window.showErrorMessage('No clusters');
        return;
    }
    const state: Partial<CreateTopicState> = {
        clusterId: clusterId,
        totalSteps: clusterId ? 3 : 4
    };

    try {
        await collectInputs(state, clusterSettings, clientAccessor);
    } catch (e) {
        showErrorMessage('Error while collecting inputs for creating topic', e);
        return;
    }
    const selectedClusterId = state.clusterId;
    if (!selectedClusterId) {
        return;
    }
    const topic = state.topicName;
    if (!topic) {
        return;
    }

    const partitions = state.partitions;
    if (!partitions) {
        return;
    }

    const replicationFactor = state.replicationFactor;
    if (!replicationFactor) {
        return;
    }

    const clusterName = clusterSettings.get(selectedClusterId)?.name || selectedClusterId;
    try {
        const client = await clientAccessor.get(selectedClusterId);
        const result = await client.createTopic({
            topic,
            partitions: parseInt(partitions, 10),
            replicationFactor: parseInt(replicationFactor, 10),
        });

        if (result.length > 0) {
            showErrorMessage(`Error while creating topic for cluster '${clusterName}'`, result[0].error);
        } else {
            explorer.refresh();
            window.showInformationMessage(`Topic '${topic}' in cluster '${clusterName}' created successfully`);
            // Selecting the created topic is done with TreeView#reveal
            // 1. Show the treeview of the explorer (otherwise reveal will not work)
            explorer.show();
            // 2. the reveal() call must occur within a timeout(),
            // while waiting for a fix in https://github.com/microsoft/vscode/issues/114149
            setTimeout(() => {
                explorer.selectTopic(clusterName, topic);
            }, 1000);
        }
    } catch (error) {
        showErrorMessage(`Error while creating topic for cluster '${clusterName}'`, error);
    }
}

async function collectInputs(state: Partial<CreateTopicState>, clusterSettings: ClusterSettings, clientAccessor: ClientAccessor) {
    if (state.clusterId) {
        if (!state.maxReplicas) {
            await setDefaultAndMaxReplicas(clientAccessor, state);
            if (state.maxReplicas! <= 1) {
                state.totalSteps = state.totalSteps! - 1;
            }
        }
        await MultiStepInput.run(input => inputTopicName(input, state, clientAccessor));
    } else {
        await MultiStepInput.run(input => inputSelectCluster(input, state, clusterSettings, clientAccessor));
    }
}

async function inputSelectCluster(input: MultiStepInput, state: Partial<CreateTopicState>, clusterSettings: ClusterSettings, clientAccessor: ClientAccessor) {
    //reset total steps
    state.totalSteps = 4;
    interface ClusterPickItem extends QuickPickItem {
        clusterId: string;
    }
    const clusters = clusterSettings.getAll();
    const selected = clusterSettings.selected;
    let activeClusterItem: ClusterPickItem | undefined;
    const clusterItems: ClusterPickItem[] = clusters.map((cluster) => {
        const item = { label: cluster.name, clusterId: cluster.id };
        if (selected && cluster === selected) {
            activeClusterItem = item;
        }
        return item;
    });
    if (!activeClusterItem) {
        activeClusterItem = clusterItems[0];
    }
    const selectedCluster: ClusterPickItem = (await input.showQuickPick({
        title: INPUT_TITLE,
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        placeholder: 'Pick a cluster',
        items: clusterItems,
        activeItem: activeClusterItem
    }));
    state.clusterId = selectedCluster.clusterId;
    await setDefaultAndMaxReplicas(clientAccessor, state);
    if (state.maxReplicas! <= 1) {
        state.totalSteps = state.totalSteps! - 1;
    }
    return (input: MultiStepInput) => inputTopicName(input, state, clientAccessor);
}

async function inputTopicName(input: MultiStepInput, state: Partial<CreateTopicState>, clientAccessor: ClientAccessor) {
    const existingTopicNames = await getExistingTopicNames(clientAccessor, state.clusterId);
    if (existingTopicNames === undefined) {
        return;
    }
    state.topicName = await input.showInputBox({
        title: INPUT_TITLE,
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        value: state.topicName || '',
        prompt: 'Topic name',
        validationContext: existingTopicNames,
        validate: validateTopicName
    });
    return (input: MultiStepInput) => inputPartitions(input, state);
}

async function getExistingTopicNames(clientAccessor: ClientAccessor, clusterId?: string): Promise<string[] | undefined> {
    if (!clusterId) { return []; }
    try {
        const client = await clientAccessor.get(clusterId);
        return (await client.getTopics()).map(topic => topic.id);
    }
    catch (error) {
        showErrorMessage(`Error while getting topics for cluster '${clusterId}'`, error);
        return undefined;
    }
}

async function inputPartitions(input: MultiStepInput, state: Partial<CreateTopicState>) {
    state.partitions = await input.showInputBox({
        title: INPUT_TITLE,
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        value: state.partitions || DEFAULT_PARTITIONS.toString(),
        prompt: 'Number of partitions',
        validate: validatePartitions
    });
    return (input: MultiStepInput) => inputReplicationFactor(input, state);
}


async function inputReplicationFactor(input: MultiStepInput, state: Partial<CreateTopicState>) {
    if (state.maxReplicas! <= 1) {
        state.replicationFactor = state.maxReplicas!.toString();
        return;
    }
    state.replicationFactor = await input.showInputBox({
        title: INPUT_TITLE,
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        value: state.replicationFactor || state.defaultReplicas!.toString(),
        prompt: 'Replication Factor',
        validationContext: state.maxReplicas,
        validate: validateReplicationFactor
    });
}
async function setDefaultAndMaxReplicas(clientAccessor: ClientAccessor, state: Partial<CreateTopicState>): Promise<void> {
    const client = await clientAccessor.get(state.clusterId!);
    const brokers = await client.getBrokers();
    let defaultReplicationFactor = -1;
    let maxReplicas = 1;
    if (brokers) {
        maxReplicas = brokers.length;
        try {
            for (let i = 0; i < brokers.length && defaultReplicationFactor < 0; i++) {
                const configs = await client.getBrokerConfigs(brokers[i].id);
                let config = configs.find(ce => ce.configName === BrokerConfigs.OFFSETS_TOPIC_REPLICATION_FACTOR);
                if (config && config.configValue !== null) {
                    defaultReplicationFactor = parseInt(config.configValue, 10);
                } else {
                    config = configs.find(ce => ce.configName === BrokerConfigs.DEFAULT_REPLICATION_FACTOR);
                    if (config && config.configValue !== null) {
                        defaultReplicationFactor = parseInt(config.configValue, 10);
                    }
                }
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.log(`Failed to read replication factor configuration from broker: ${message}`);
        }
        if (defaultReplicationFactor < 0) {
            defaultReplicationFactor = Math.min(3, maxReplicas);
        }
    }
    state.maxReplicas = maxReplicas;
    state.defaultReplicas = defaultReplicationFactor;
}

