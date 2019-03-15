import * as vscode from "vscode";

import { Broker, Client, Topic } from "../client";

export async function pickTopic(client: Client): Promise<Topic | undefined> {
    const topics = client.getTopics();
    const topicQuickPickItems = topics.map((topic) => {
        return {
            label: topic.id,
            description: `Partitions: ${topic.partitionCount}`,
            topic,
        };
    });

    const pickedTopic = await vscode.window.showQuickPick(topicQuickPickItems);

    if (!pickedTopic) {
        return;
    }

    return pickedTopic.topic;
}

export async function pickBroker(client: Client): Promise<Broker | undefined> {
    const brokers = client.getBrokers();
    const brokerQuickPickItems = brokers.map((broker) => {
        return {
            label: `${broker.host}:${broker.port}`,
            description: `ID: ${broker.id}`,
            broker,
        };
    });

    const pickedBroker = await vscode.window.showQuickPick(brokerQuickPickItems);

    if (!pickedBroker) {
        return;
    }

    return pickedBroker.broker;
}
