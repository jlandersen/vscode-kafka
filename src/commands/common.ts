import * as vscode from "vscode";

import { Broker, Topic, ClientAccessor, Cluster, Client } from "../client";
import { CommonMessages } from "../constants";
import { ClusterSettings } from "../settings";

export async function pickClient(clientAccessor: ClientAccessor, clusterId?: string) : Promise<Client| undefined> {
    let client: Client | undefined = undefined;

    if (clusterId) {
        client = clientAccessor.get(clusterId);
    } else {
        client = clientAccessor.getSelectedClusterClient();
    }

    if (!client) {
        CommonMessages.showNoSelectedCluster();
    }
    return client;
}
export async function pickCluster(clusterSettings: ClusterSettings): Promise<Cluster | undefined> {
    const clusters = clusterSettings.getAll();

    const clusterQuickPickItems = clusters.map((cluster) => {
        return {
            label: cluster.name,
            describe: cluster.bootstrap,
            cluster,
        };
    });

    const pickedCluster = await vscode.window.showQuickPick(clusterQuickPickItems, { placeHolder: "Select cluster" });
    return pickedCluster?.cluster;
}

export async function pickTopic(client: Client): Promise<Topic | undefined> {
    const topics = await client.getTopics();
    const topicQuickPickItems = topics.map((topic) => {
        return {
            label: topic.id,
            description: `Partitions: ${topic.partitionCount}`,
            topic,
        };
    });

    const pickedTopic = await vscode.window.showQuickPick(topicQuickPickItems);
    return pickedTopic?.topic;
}

export async function pickConsumerGroupId(client: Client): Promise<string | undefined> {
    const groupIds = await client.getConsumerGroupIds();
    const groupIdQuickPickItems = groupIds.map((groupId) => {
        return {
            label: groupId        };
    });

    const pickedGroupId = await vscode.window.showQuickPick(groupIdQuickPickItems);

    return pickedGroupId?.label;
}

export async function pickBroker(clientAccessor: ClientAccessor): Promise<Broker | undefined> {
    const client = await pickClient(clientAccessor);
    if (!client) {
        return;
    }

    const brokers = await client.getBrokers();
    const brokerQuickPickItems = brokers.map((broker) => {
        return {
            label: `${broker.host}:${broker.port}`,
            description: `ID: ${broker.id}`,
            broker,
        };
    });

    const pickedBroker = await vscode.window.showQuickPick(brokerQuickPickItems);
    return pickedBroker?.broker;
}
