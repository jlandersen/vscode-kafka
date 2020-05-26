import * as vscode from "vscode";
import { ConsumerCollection } from "../client";

export class ConsumerStatusBarItem implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;

    constructor(private consumerCollection: ConsumerCollection) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = "Current Consumers";
        this.statusBarItem.command = "vscode-kafka.consumer.list";

        this.consumerCollection.onDidChangeCollection(() => {
            this.render();
        });
    }

    public render(): void {
        if (this.consumerCollection.length() === 0) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.show();
        this.statusBarItem.text = `Consumers: ${this.consumerCollection.length().toString()}`;
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
