import { NodeBase } from "./models/nodeBase";

export interface ExplorerRefreshTarget {
    refresh(): void;
    refreshItem(item?: NodeBase): void;
}
