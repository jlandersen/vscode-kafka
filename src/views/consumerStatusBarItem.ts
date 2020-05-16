import * as vscode from "vscode";
import { ConsumerCollection } from "../client";

export class ConsumerStatusBarItem implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private consumerCollection = ConsumerCollection.getInstance();

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = "Current Consumers";
        this.statusBarItem.command = "vscode-kafka.consumer.list";
        this.consumerCollection.onDidChangeCollection(() => {
            this.render();
        });
    }

    render(): void {
        if (this.consumerCollection.length() === 0) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.show();
        this.statusBarItem.text = `Consumers: ${this.consumerCollection.length().toString()}`;
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
