import * as vscode from "vscode";
import { ClusterSettings } from "../settings";

export class SelectedClusterStatusBarItem implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;

    constructor (private clusterSettings: ClusterSettings) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = "Selected kafka cluster";
        this.statusBarItem.command = "vscode-kafka.explorer.selectcluster";

        this.clusterSettings.onDidChangeSelected(() => {
            this.render();
        });

        this.render();
    }

    public render(): void {
        if (!this.clusterSettings.selected) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.show();
        this.statusBarItem.text = `$(database) Kafka: ${this.clusterSettings.selected.name}`;
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}