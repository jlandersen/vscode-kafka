import * as vscode from "vscode";
import { dump } from "js-yaml";
import { Broker, ClientAccessor } from "../client";
import { BrokerItem } from "../explorer/models/brokers";
import { OutputChannelProvider } from "../providers";
import { pickBroker, pickClient, pickCluster } from "./common";
import { ClusterSettings } from "../settings";
import { KafkaExplorer } from "../explorer";
import { openClusterForm, openClusterWizard } from "../wizards/clusters";

/**
 * Adds a new cluster to the collection.
 */
export class AddClusterCommandHandler {

    public static commandId = "vscode-kafka.explorer.addcluster";

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer, private context: vscode.ExtensionContext) {
    }

    async execute(selectCluster = false): Promise<void> {
        openClusterWizard(this.clusterSettings, this.clientAccessor, this.explorer, this.context, selectCluster);
    }

}

/**
 * Deletes an existing cluster from the collection.
 */
export class DeleteClusterCommandHandler {

    public static commandId = 'vscode-kafka.cluster.delete';

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer) {
    }

    async execute(clusterId?: string): Promise<void> {
        const cluster = clusterId ? this.clusterSettings.get(clusterId) : await pickCluster(this.clusterSettings);
        if (!cluster) {
            return;
        }

        const deleteConfirmation = await vscode.window.showWarningMessage(`Are you sure you want to delete cluster '${cluster.name}'?`, 'Cancel', 'Delete');
        if (deleteConfirmation !== 'Delete') {
            return;
        }

        this.clusterSettings.remove(cluster.id);
        this.clientAccessor.remove(cluster.id);
        this.explorer.refresh();
    }
}

/**
 * Marks a cluster from the collection as selected.
 * The selected cluster is used for producing and consuming.
 */
export class SelectClusterCommandHandler {

    public static commandId = 'vscode-kafka.explorer.selectcluster';

    constructor(private clusterSettings: ClusterSettings, private addClusterCommandHandler: AddClusterCommandHandler) {
    }

    async execute(clusterId?: string): Promise<void> {
        if (!clusterId) {
            const pickedCluster = await pickCluster(this.clusterSettings, this.addClusterCommandHandler);
            if (!pickedCluster) {
                return;
            }

            clusterId = pickedCluster.id;
        }

        this.clusterSettings.selected = this.clusterSettings.get(clusterId);
    }
}

export class EditClusterCommandHandler {

    public static commandId = 'vscode-kafka.explorer.editcluster';

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer, private context: vscode.ExtensionContext) {
    }

    async execute(clusterId?: string): Promise<void> {
        let cluster;
        if (!clusterId) {
            cluster = await pickCluster(this.clusterSettings);
        } else {
            cluster = this.clusterSettings.get(clusterId);
        }
        if (!cluster) {
            return;
        }
        openClusterForm(cluster, this.clusterSettings, this.clientAccessor, this.explorer, this.context, false);
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
        const client = await pickClient(this.clientAccessor);

        if (!client) {
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
