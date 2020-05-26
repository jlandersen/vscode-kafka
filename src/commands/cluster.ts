import * as vscode from "vscode";
import { dump } from "js-yaml";
import { Broker, ClientAccessor } from "../client";
import { BrokerItem } from "../explorer/models/brokers";
import { OutputChannelProvider } from "../providers";
import { pickBroker, pickCluster } from "./common";
import { ClusterSettings } from "../settings";
import { KafkaExplorer } from "../explorer";

/**
 * Adds a new cluster to the collection.
 */
export class AddClusterCommandHandler {
    constructor(private clusterSettings: ClusterSettings, private explorer: KafkaExplorer) {
    }

    async execute(): Promise<void> {
        const bootstrapServers = await vscode.window.showInputBox({ placeHolder: "Broker(s) (localhost:9092,localhost:9093...)" });

        if (!bootstrapServers) {
            return;
        }

        const name = await vscode.window.showInputBox({ placeHolder: "Friendly name" });

        if (!name) {
            return;
        }

        const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "");
        const suffix = Buffer.from(bootstrapServers).toString("base64").replace(/=/g, "").substr(0,10);

        this.clusterSettings.upsert({
            id: `${sanitizedName}-${suffix}`,
            bootstrap: bootstrapServers,
            name: name,
        });

        this.explorer.refresh();
    }
}

/**
 * Deletes an existing cluster from the collection.
 */
export class DeleteClusterCommandHandler {
    constructor(private clusterSettings: ClusterSettings, private explorer: KafkaExplorer) {
    }

    async execute(clusterId?: string): Promise<void> {
        if (!clusterId) {
            return;
        }

        this.clusterSettings.remove(clusterId);
        this.explorer.refresh();
    }
}

/**
 * Marks a cluster from the collection as selected.
 * The selected cluster is used for producing and consuming.
 */
export class SelectClusterCommandHandler {
    constructor(private clusterSettings: ClusterSettings) {
    }

    async execute(clusterId?: string): Promise<void> {
        if (!clusterId) {
            const pickedCluster = await pickCluster(this.clusterSettings);
            
            if (!pickedCluster) {
                return;
            }

            clusterId = pickedCluster.id;
        }

        this.clusterSettings.selected = this.clusterSettings.get(clusterId);
    }
}

/**
 * Dumps the metadata for a specific broker in the cluster to an output channel.
 */
export class DumpBrokerMetadataCommandHandler {
    constructor(private clientAccessor: ClientAccessor, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute(brokerItem?: BrokerItem): Promise<void> {
        let brokerToDump: Broker | undefined = brokerItem?.broker;

        if (!brokerToDump) {
            brokerToDump = await pickBroker(this.clientAccessor);
        }

        if (!brokerToDump) {
            return;
        }

        // Delete extension specific property
        brokerToDump = Object.assign({}, brokerToDump);
        delete brokerToDump.isConnected;

        const channel = this.outputChannelProvider.getChannel("Broker Metadata");
        channel.clear();
        channel.append(dump(brokerToDump));
        channel.show();
    }
}

export class DumpClusterMetadataCommandHandler {
    constructor(private clientAccessor: ClientAccessor, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute(): Promise<void> {
        const client = this.clientAccessor.getSelectedClusterClient();

        if (!client) {
            vscode.window.showInformationMessage("No selected cluster");
            return;
        }

        const brokers = await client.getBrokers();
        const data = brokers.map((broker: any) => {
            // Delete extension specific property
            const sanitized = Object.assign({}, broker);
            delete sanitized.isConnected;
            return sanitized;
        });

        const channel = this.outputChannelProvider.getChannel("Cluster Metadata");
        channel.clear();
        channel.append(dump(data));
        channel.show();
    }
}
