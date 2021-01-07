import { Disposable, TreeItemCollapsibleState } from "vscode";
import { ClientAccessor } from "../../client";
import { ClusterSettings } from "../../settings";
import { ClusterItem } from "./cluster";
import { InformationItem } from "./common";
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
        const clusters = this.clusterSettings.getAll();
        if (clusters.length === 0) {
            return [new InformationItem("No clusters added", this)];
        }
        return clusters.map((c) => {
            return new ClusterItem(this.clientAccessor.get(c.id), c, this);
        });
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
