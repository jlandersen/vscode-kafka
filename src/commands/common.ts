import * as vscode from "vscode";

import { Broker, Topic, ClientAccessor, Cluster, Client } from "../client";
import { CommonMessages } from "../constants";
import { ClusterSettings } from "../settings";
import { AddClusterCommandHandler } from "./cluster";

export async function pickClient(clientAccessor: ClientAccessor, clusterId?: string): Promise<Client | undefined> {
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
export async function pickCluster(clusterSettings: ClusterSettings, addClusterCommandHandler: AddClusterCommandHandler | undefined = undefined): Promise<Cluster | undefined> {
    const clusters = clusterSettings.getAll();

    const clusterQuickPickItems: { label: string; description?: string; cluster: Cluster | null; }[] = clusters.map((cluster) => {
        return {
            label: cluster.name,
            description: `(${cluster.bootstrap})`,
            cluster,
        };
    });
    if (addClusterCommandHandler) {
        clusterQuickPickItems.push({
            label: "New Cluster...",
            cluster: null
        });
    }

    const pickedCluster = await vscode.window.showQuickPick(clusterQuickPickItems, { placeHolder: "Select cluster" });
    if (!pickedCluster) {
        return;
    }
    if (pickedCluster.cluster !== null) {
        return pickedCluster.cluster;
    }
    // New Cluster, open the wizard to create a cluster.
    if (addClusterCommandHandler) {
        addClusterCommandHandler.execute(true);
    }
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
            label: groupId
        };
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
