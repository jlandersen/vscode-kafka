import { Disposable, TreeItemCollapsibleState } from "vscode";
import { ClientAccessor, Cluster } from "../../client";
import { ClusterSettings } from "../../settings";
import { ClusterItem, NoClusterItem } from "./cluster";
import { NodeBase } from "./nodeBase";

export class KafkaModel extends NodeBase implements Disposable {

    public contextValue = "";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    constructor(
        protected clusterSettings: ClusterSettings,
        protected clientAccessor: ClientAccessor) {
        super(undefined);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const clusters = this.clusterSettings.getAll()
            .sort(this.sortByNameAscending);
        if (clusters.length === 0) {
            return [new NoClusterItem(this)];
        }
        return clusters.map((c) => {
            return new ClusterItem(this.clientAccessor.get(c.id), c, this);
        });
    }

    private sortByNameAscending(a: Cluster, b: Cluster): -1 | 0 | 1 {
        if (a.name.toLowerCase() < b.name.toLowerCase()) { return -1; }
        if (a.name.toLowerCase() > b.name.toLowerCase()) { return 1; }
        return 0;
    }

    public dispose(): void {
        this.children?.forEach(child => (<ClusterItem>child).dispose());
    }

    async findClusterItemByName(clusterName: string): Promise<NodeBase | ClusterItem | undefined> {
        return this.getChildren()
            .then(clusters =>
                clusters.find(child => (<ClusterItem>child).cluster.name === clusterName)
            );
    }
}
