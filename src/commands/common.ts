import * as vscode from "vscode";

import { Client, Topic } from "../client";

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
