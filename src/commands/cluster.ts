import * as vscode from "vscode";
import { dump } from "js-yaml";
import { Broker, ClientAccessor, SaslOption } from "../client";
import { BrokerItem } from "../explorer/models/brokers";
import { OutputChannelProvider } from "../providers";
import { pickBroker, pickCluster } from "./common";
import { ClusterSettings } from "../settings";
import { KafkaExplorer } from "../explorer";

/**
 * Adds a new cluster to the collection.
 */
export class AddClusterCommandHandler {
    private readonly AuthOptions = ["None", "SASL/PLAIN"];

    constructor(private clusterSettings: ClusterSettings, private explorer: KafkaExplorer) {
    }

    async execute(): Promise<void> {
        const bootstrap = await vscode.window.showInputBox({ placeHolder: "Broker(s) (localhost:9092,localhost:9093...)", ignoreFocusOut: true });

        if (!bootstrap) {
            return;
        }

        const name = await vscode.window.showInputBox({ placeHolder: "Friendly name", ignoreFocusOut: true });

        if (!name) {
          return;
        }

        const pickedAuthOption = await vscode.window.showQuickPick(this.AuthOptions, { placeHolder: "Authentication", ignoreFocusOut: true });
        let saslOption: SaslOption | undefined;

        if (pickedAuthOption && pickedAuthOption === this.AuthOptions[1]) {
            const username = await vscode.window.showInputBox({ placeHolder: "Username", ignoreFocusOut: true });
            const password = await vscode.window.showInputBox({ placeHolder: "Password", password: true, ignoreFocusOut: true });

            if (username && password) {
                saslOption = {
                    mechanism: "plain",
                    username,
                    password,
                };
            }
        }

        const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "");
        const suffix = Buffer.from(bootstrap).toString("base64").replace(/=/g, "");

        this.clusterSettings.upsert({
            id: `${sanitizedName}-${suffix}`,
            bootstrap,
            name,
            saslOption,
        });

        this.explorer.refresh();
    }
}

/**
 * Deletes an existing cluster from the collection.
 */
export class DeleteClusterCommandHandler {
    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer) {
    }

    async execute(clusterId?: string): Promise<void> {
        if (!clusterId) {
            return;
        }
        const cluster = this.clusterSettings.get(clusterId);
        if (!cluster) {
            return;
        }

        const deleteConfirmation = await vscode.window.showWarningMessage(`Are you sure you want to delete cluster '${cluster.name}'?`, 'Cancel', 'Delete');
        if (deleteConfirmation !== 'Delete') {
            return;
        }

        this.clusterSettings.remove(clusterId);
        this.clientAccessor.remove(clusterId);
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
