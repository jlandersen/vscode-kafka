import { Disposable, TreeItemCollapsibleState } from "vscode";
import { ClusterSettings, SchemaRegistrySettings } from "../../settings";
import { NodeBase } from "./nodeBase";
import { SchemaRegistryConnectionNode } from "./schemaRegistry";
import { InformationItem } from "./common";

export class SchemaRegistryConnectionsModel extends NodeBase implements Disposable {
    public contextValue = "";
    public collapsibleState = TreeItemCollapsibleState.Collapsed;

    constructor(
        private readonly schemaRegistrySettings: SchemaRegistrySettings,
        private readonly clusterSettings: ClusterSettings
    ) {
        super(undefined);
    }

    public async computeChildren(): Promise<NodeBase[]> {
        const schemaRegistries = this.schemaRegistrySettings.getAll();
        if (schemaRegistries.length === 0) {
            return [new InformationItem("No schema registries configured", this)];
        }

        return schemaRegistries.map(schemaRegistry => new SchemaRegistryConnectionNode(
            schemaRegistry,
            this.clusterSettings,
            this
        ));
    }

    public dispose(): void {
        // noop
    }
}
