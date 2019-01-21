import * as vscode from "vscode";

export class OutputChannelProvider implements vscode.Disposable {
    private channels: {
        [id: string]: vscode.OutputChannel | undefined;
    } = {};

    getChannel(name: string) {
        let channel = this.channels[name];

        if (!channel) {
            channel = vscode.window.createOutputChannel(name);
            this.channels[name] = channel;
        }

        return channel;
    }

    dispose() {
        for (const channelId of Object.keys(this.channels)) {
            const channel = this.channels[channelId];

            if (channel) {
                channel.dispose();
            }
        }
    }
}
