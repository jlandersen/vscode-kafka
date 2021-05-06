import * as vscode from "vscode";
import { KafkaConfig } from "kafkajs";
import { Cluster, ConnectionOptions, createDefaultKafkaConfig as createDefaultKafkaConfig } from "../client/client";
import { ClusterSettings } from "../settings/clusters";
import { configureDefaultClusters } from "../wizards/clusters";
import { ClusterProviderParticipant, KafkaExtensionParticipant } from "./api";
import { ClientAccessor } from "../client";

/**
 * Cluster provider is used to:
 *
 *  - collect clusters (eg: create a cluster from a wizard, import clusters from a repository, ...)
 * and add them to the Kafka Explorer.
 *  - configure a Kafka client from a complex process (eg : use SSO to connect to the cluster)
 *
 * Implementing a cluster provider in a 3rd party extension is done in 2 steps:
 *
 *  - define the cluster provider (id, name) in the package.json in the contributes/kafka/clusterProviders section.
 *  - return the cluster provider participant (See KafkaExtensionParticipant) to use in the activate() of the extension.
 *
 */
export class ClusterProvider {

    private clusterProviderParticipant: ClusterProviderParticipant | undefined;

    constructor(private definition: ClusterProviderDefinition, private extensionId: string) {

    }

    /**
     * Returns the cluster provider id.
     */
    public get id(): string {
        return this.definition.id;
    }

    /**
     * Returns the cluster provider name.
     */
    public get name(): string {
        return this.definition.name || this.definition.id;
    }

    /**
     * Returns the clusters managed by the provider which must be added to the kafka explorer.
     *
     * @param clusterSettings the cluster settings.
     */
    async collectClusters(clusterSettings: ClusterSettings): Promise<Cluster[] | undefined> {
        const processor = await this.getClusterProviderParticipant();
        return processor.configureClusters(clusterSettings);
    }

    /**
     * Create the Kafka JS client config from the given connection options.
     *
     * @param connectionOptions the connection options.
     */
    async createKafkaConfig(connectionOptions: ConnectionOptions): Promise<KafkaConfig | undefined> {
        const clusterProviderParticipant = await this.getClusterProviderParticipant();
        if (clusterProviderParticipant.createKafkaConfig) {
            return clusterProviderParticipant.createKafkaConfig(connectionOptions);
        }
    }

    private async getClusterProviderParticipant(): Promise<ClusterProviderParticipant> {
        if (this.clusterProviderParticipant) {
            return this.clusterProviderParticipant;
        }
        // The cluster provider participant is not already loaded, try to activate the contributing extension.
        // The extension's activate() method must return the kafka extension participant.
        const extension = vscode.extensions.getExtension(this.extensionId);
        if (!extension) {
            throw new Error(`Error while getting cluster provider processor. Extension ${this.extensionId} is not available.`);
        }

        // Wait for extension is activated to get the the kafka extension participant
        const result = await extension.activate();
        if (!result) {
            throw new Error(`Error while getting cluster provider processor. Extension ${this.extensionId}.activate() should return 'KafkaExtensionParticipant'.`);
        }
        if (isKafkaExtensionParticipant(result)) {
            this.clusterProviderParticipant = (<KafkaExtensionParticipant>result).getClusterProviderParticipant(this.id);
        }
        if (!this.clusterProviderParticipant) {
            throw new Error(`Error while getting cluster provider participant. Extension ${this.extensionId}.activate() should return 'KafkaExtensionParticipant'.`);
        }
        return this.clusterProviderParticipant;
    }
}

function isKafkaExtensionParticipant(arg: any): boolean {
    return (arg as KafkaExtensionParticipant).getClusterProviderParticipant !== undefined;
}

const defaultClusterProviderId = 'vscode-kafka.manual';

let providers: Map<string, ClusterProvider> = new Map();

export function getClusterProvider(clusterProviderId?: string): ClusterProvider | undefined {
    initializeIfNeeded();
    return providers.get(clusterProviderId || defaultClusterProviderId);
}

export function getClusterProviders(): ClusterProvider[] {
    initializeIfNeeded();
    // "Configure manually" provider must be the first
    const manual = getClusterProvider(defaultClusterProviderId);
    // Other providers must be sorted by name ascending
    const others = [...providers.values()]
        .filter(provider => provider.id !== defaultClusterProviderId)
        .sort(sortByNameAscending);
    if (manual) {
        return [manual, ...others];
    }
    return others;
}

function sortByNameAscending(a: ClusterProvider, b: ClusterProvider): -1 | 0 | 1 {
    if (a.name.toLowerCase() < b.name.toLowerCase()) { return -1; }
    if (a.name.toLowerCase() > b.name.toLowerCase()) { return 1; }
    return 0;
}

function initializeIfNeeded() {
    if (providers.size === 0) {
        refreshClusterProviderDefinitions();
    }
}

export interface ClusterProviderDefinition {
    id: string;
    name?: string;
}
export function refreshClusterProviderDefinitions() {
    const oldClusterProviderIds = Array.from(providers.keys());
    providers = collectClusterProviderDefinitions(vscode.extensions.all);
    const newClusterProviderIds = Array.from(providers.keys());

    // Disconnect all kafka client linked to a cluster provider id coming from an installed/uninstalled extension
    const oldIdsToDispose = oldClusterProviderIds.filter(id => !newClusterProviderIds.includes(id));
    const newIdsToDispose = newClusterProviderIds.filter(id => !oldClusterProviderIds.includes(id));
    const allIdsToDispose = [...oldIdsToDispose, ...newIdsToDispose];
    if (allIdsToDispose.length > 0) {
        const toDispose = [...new Set(allIdsToDispose)];
        ClientAccessor.getInstance().dispose(toDispose);
    }
}

/**
 * Collect cluster providers defined in package.json (see vscode-kafka which implements default cluster provider with 'Manual' wizard.)
 *
 * ```json
 *     "contributes": {
 *      "kafka": {
 *          "clusterProviders": [
 *              {
 *                  "id": "vscode-kafka.manual",
                    "name": "Configure manually"
 *              }
 *          ]
 *      }
 * ```
 *
 * @param extensions all installed vscode extensions
 *
 * @returns the map of cluster providers.
 */
function collectClusterProviderDefinitions(extensions: readonly vscode.Extension<any>[]): Map<string, ClusterProvider> {
    const result: Map<string, ClusterProvider> = new Map();
    if (extensions && extensions.length) {
        for (const extension of extensions) {
            const contributesSection = extension.packageJSON['contributes'];
            if (contributesSection) {
                const kafkaExtension = contributesSection['kafka'];
                if (kafkaExtension) {
                    const clusterProviders = kafkaExtension['clusterProviders'];
                    if (Array.isArray(clusterProviders) && clusterProviders.length) {
                        for (const item of clusterProviders) {
                            const definition = item as ClusterProviderDefinition;
                            result.set(definition.id, new ClusterProvider(definition, extension.id));
                        }
                    }
                }
            }
        }
    }
    return result;
}

export function getDefaultKafkaExtensionParticipant(): KafkaExtensionParticipant {
    return {
        getClusterProviderParticipant(clusterProviderId: string): ClusterProviderParticipant {
            return {
                configureClusters: (clusterSettings: ClusterSettings): Promise<Cluster[] | undefined> => configureDefaultClusters(clusterSettings),
                createKafkaConfig: (connectionOptions: ConnectionOptions): KafkaConfig => createDefaultKafkaConfig(connectionOptions)
            } as ClusterProviderParticipant;
        }
    };
}
