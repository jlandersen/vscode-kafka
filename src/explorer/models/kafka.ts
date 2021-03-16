import { Disposable, TreeItemCollapsibleState } from "vscode";
import { ClientAccessor, Cluster } from "../../client";
import { getClusterProviders } from "../../kafka-extensions/registry";
import { ClusterSettings } from "../../settings";
import { ClusterItem, ClusterProviderItem } from "./cluster";
import { NodeBase } from "./nodeBase";

export class KafkaModel extends NodeBase implements Disposable {

    public contextValue = "";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    private clusterProviders = getClusterProviders();
    constructor(
        public readonly clusterSettings: ClusterSettings,
        protected clientAccessor: ClientAccessor) {
        super(undefined);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        if (this.clusterProviders.length <= 1) {
            const clusters = this.clusterSettings.getAll();
            return clusters.map((c) => {
                return new ClusterItem(this.clusterSettings, this.clientAccessor, c, this);
            });
        } else {
            return this.clusterProviders.map((p) => {
                return new ClusterProviderItem(this.clientAccessor, p, this);
            });
        }
    }

    public dispose(): void {
        this.children?.forEach(child => (<Disposable><unknown>child).dispose());
    }

    async findClusterItemByName(clusterName: string): Promise<NodeBase | ClusterItem | undefined> {
        return this.findClusterItemBy((cluster) => (cluster.name === clusterName));
    }

    async findClusterItemById(clusterId: string): Promise<NodeBase | ClusterItem | undefined> {
        return this.findClusterItemBy((cluster) => (cluster.id === clusterId));
    }

    async findClusterItemBy(predicate: (cluster: Cluster) => boolean): Promise<NodeBase | ClusterItem | undefined> {
        const children = await this.getChildren();
        if (this.clusterProviders.length <= 1) {
            return children.find(child => predicate((<ClusterItem>child).cluster));
        }
        for (const child of children) {
            const clusters = await (<ClusterProviderItem>child).getChildren();
            const cluster = clusters.find(c => predicate((<ClusterItem>c).cluster));
            if (cluster) {
                return cluster;
            }
        }
    }

}
