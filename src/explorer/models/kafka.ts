import { Disposable, Event, TreeItemCollapsibleState } from "vscode";
import { ClientAccessor } from "../../client";
import { ClusterSettings, SchemaRegistrySettings } from "../../settings";
import { ClusterItem } from "./cluster";
import { NodeBase } from "./nodeBase";
import { SchemaRegistryConnectionsItem } from "./schemaRegistry";
export interface KafkaModelProvider {
    getDataModel(): KafkaModel;

    onDidChangeDataModel: Event<KafkaModel>;
}

export class KafkaModel extends NodeBase implements Disposable {
    public contextValue = "";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    constructor(
        public readonly clusterSettings: ClusterSettings,
        public readonly schemaRegistrySettings: SchemaRegistrySettings,
        protected clientAccessor: ClientAccessor) {
        super(undefined);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const clusterGroup = new ClustersRootItem(this.clusterSettings, this.clientAccessor, this);
        const schemaRegistryGroup = new SchemaRegistryConnectionsItem(this.schemaRegistrySettings, this.clusterSettings, this);
        return [clusterGroup, schemaRegistryGroup];
    }

    public dispose(): void {
        this.children?.forEach(child => {
            if (child instanceof ClusterItem) {
                child.dispose();
            } else {
                child.getChildren().then(children => {
                    children.forEach(groupChild => {
                        if (groupChild instanceof ClusterItem) {
                            groupChild.dispose();
                        }
                    });
                });
            }
        });
    }

    async findClusterItemByName(clusterName: string): Promise<NodeBase | ClusterItem | undefined> {
        const clusterItems = await this.getClusterItems();
        return clusterItems.find(child => child.cluster.name === clusterName);
    }

    async findClusterItemById(clusterId: string): Promise<ClusterItem | undefined> {
        const clusters = await this.getClusterItems();
        return clusters.find(child => child.cluster.id === clusterId);
    }

    private async getClusterItems(): Promise<ClusterItem[]> {
        const rootChildren = await this.getChildren();
        const clustersRoot = rootChildren.find(child => child instanceof ClustersRootItem) as ClustersRootItem | undefined;
        if (!clustersRoot) {
            return [];
        }
        const clusters = await clustersRoot.getChildren();
        return clusters.filter(child => child instanceof ClusterItem) as ClusterItem[];
    }
}

class ClustersRootItem extends NodeBase {
    public label = "Clusters";
    public contextValue = "clustersroot";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    constructor(
        private readonly clusterSettings: ClusterSettings,
        private readonly clientAccessor: ClientAccessor,
        parent: NodeBase
    ) {
        super(parent);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const clusters = this.clusterSettings.getAll();
        const clusterItems = clusters.map(cluster => new ClusterItem(this.clientAccessor, cluster, this));
        await Promise.all(clusterItems.map(clusterItem => clusterItem.refreshConnectionState()));
        return clusterItems;
    }
}
