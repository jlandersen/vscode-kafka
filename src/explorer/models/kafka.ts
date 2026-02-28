import { Disposable, Event, TreeItemCollapsibleState } from "vscode";
import { ClientAccessor } from "../../client";
import { ClusterSettings } from "../../settings";
import { ClusterItem } from "./cluster";
import { NodeBase } from "./nodeBase";
export interface KafkaModelProvider {
    getDataModel(): KafkaModel;

    onDidChangeDataModel: Event<KafkaModel>;
}

export class KafkaModel extends NodeBase implements Disposable {
    public contextValue = "";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    constructor(
        public readonly clusterSettings: ClusterSettings,
        protected clientAccessor: ClientAccessor) {
        super(undefined);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const clusters = this.clusterSettings.getAll();
        const clusterItems = clusters.map(cluster => new ClusterItem(this.clientAccessor, cluster, this));
        await Promise.all(clusterItems.map(clusterItem => clusterItem.refreshConnectionState()));
        return clusterItems;
    }

    public dispose(): void {
        this.children?.forEach(child => {
            if (child instanceof ClusterItem) {
                child.dispose();
            }
        });
    }

    async findClusterItemByName(clusterName: string): Promise<NodeBase | ClusterItem | undefined> {
        const clusters = await this.getChildren();
        return (clusters as ClusterItem[]).find(child => child.cluster.name === clusterName);
    }

    async findClusterItemById(clusterId: string): Promise<ClusterItem | undefined> {
        const clusters = await this.getChildren();
        return (clusters as ClusterItem[]).find(child => child.cluster.id === clusterId);
    }
}
