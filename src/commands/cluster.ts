import { dump } from "js-yaml";
import * as vscode from "vscode";
import { Broker, ClientAccessor, Cluster, ConsumerCollection } from "../client";
import { KafkaExplorer } from "../explorer";
import { BrokerItem } from "../explorer/models/brokers";
import { OutputChannelProvider } from "../providers";
import { ClusterSettings } from "../settings";
import { openClusterForm, openClusterWizard } from "../wizards/clusters";
import { showErrorMessage } from "../wizards/multiStepInput";
import { pickBroker, pickClient, pickCluster, getNames } from "./common";



export class SaveClusterCommandHandler {

    public static commandId = "vscode-kafka.api.saveclusters";

    constructor(protected clusterSettings: ClusterSettings, protected explorer: KafkaExplorer) {
    }

    async execute(clusters: Cluster[]): Promise<void> {
        if (!clusters || clusters.length === 0) {
            return;
        }
        let update = false;
        try {
            // Save collected clusters in settings.
            let createdClusterNames = getNames(clusters);
            for (const cluster of clusters) {
                update = update || !!this.clusterSettings.get(cluster.id);
                await this.clusterSettings.upsert(cluster);
            }
            vscode.window.showInformationMessage(`${clusters.length > 1 ? `${clusters.length} clusters` : 'Cluster'} ${createdClusterNames} ${update ? 'updated' : 'created'} successfully`);
    
            // Refresh the explorer
            this.explorer.refresh();
    
            // Selecting the created cluster is done with TreeView#reveal
            // 1. Show the treeview of the explorer (otherwise reveal will not work)
            this.explorer.show();
            // 2. the reveal() call must occur within a timeout(),
            // while waiting for a fix in https://github.com/microsoft/vscode/issues/114149
            const selectCluster = !update && clusters.length === 1;
            setTimeout(() => {
                this.explorer.selectClusterByName(clusters[0].name);
                if (selectCluster){
                    this.clusterSettings.selected = clusters[0];
                }
            }, 1000);
        }
        catch (error) {
            showErrorMessage(`Error while ${update ? 'updating' : 'creating'} cluster${clusters.length > 1 ?'s':''}`, error);
        }
    }
}

/**
 * Adds a new cluster to the collection.
 */
export class AddClusterCommandHandler {

    public static commandId = "vscode-kafka.explorer.addcluster";

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer, private context: vscode.ExtensionContext) {
    }

    async execute(): Promise<void> {
        openClusterWizard(this.clusterSettings, this.clientAccessor, this.explorer, this.context);
    }
}

export interface DeleteClusterRequest {
    clusterIds : string | string[] | undefined
    confirm: boolean
}

/**
 * Deletes an existing cluster from the collection.
 */
export class DeleteClusterCommandHandler {

    public static commandId = 'vscode-kafka.api.deleteclusters';
    public static userCommandId = 'vscode-kafka.cluster.delete';

    constructor(private clusterSettings: ClusterSettings, private clientAccessor: ClientAccessor, private explorer: KafkaExplorer, private consumerCollection: ConsumerCollection) {
    }

    async execute(deleteRequest: DeleteClusterRequest): Promise<void> {
        const clusterIds = deleteRequest.clusterIds;
        let clusters:(Cluster|undefined)[] = [];
        if (Array.isArray(clusterIds)) {
            clusters = clusterIds.map(id => this.clusterSettings.get(id)).filter(c=> c !== undefined);
        } else {
            const cluster = clusterIds ? this.clusterSettings.get(clusterIds) : await pickCluster(this.clusterSettings);
            if (cluster) {
                clusters.push(cluster);
            }
        }
        if (clusters.length === 0) {
            return;
        }
        if (deleteRequest.confirm) {
            const clusterNames = getNames(clusters);
            const deleteConfirmation = await vscode.window.showWarningMessage(`Are you sure you want to delete cluster${clusters.length === 1?'':'s'} ${clusterNames}?`, 'Cancel', 'Delete');
            if (deleteConfirmation !== 'Delete') {
                return;
            }
        }
        for (const cluster of clusters) {
            // Close all consumers associated with this cluster
            const consumers = this.consumerCollection.getByClusterId(cluster!.id);
            for (const consumer of consumers) {
                await this.consumerCollection.close(consumer.uri);
            }
            
            await this.clusterSettings.remove(cluster!.id);
            this.clientAccessor.remove(cluster!.id);
        }
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
        openClusterForm(cluster, this.clusterSettings, this.clientAccessor, this.explorer, this.context);
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