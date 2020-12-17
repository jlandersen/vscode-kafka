import * as vscode from "vscode";
import { ConsumedRecord, ConsumerChangedStatusEvent, ConsumerCollection, ConsumerCollectionChangedEvent, RecordReceivedEvent } from "../client";
import { OutputChannelProvider } from "../providers/outputChannelProvider";

class ConsumerOutput {
    private channel: vscode.OutputChannel;
    constructor(uri: vscode.Uri, registry: ConsumerOutputRegistry) {

        this.channel = registry.getChannel(`Kafka Consumer [${uri.path}]`);

    }

    public show(): void {
        this.channel.show();
    }

    public sendText(data: string) {
        this.channel.appendLine(data);
    }
}

export class ConsumerOutputRegistry implements vscode.Disposable {
    getChannel(name: string): vscode.OutputChannel {
        return this.channelProvider.getChannel(name);
    }

    private kafkaConsumers: { [id: string /* vscode URI */]: ConsumerOutput } = {};
    private disposables: vscode.Disposable[] = [];

    constructor(private consumerCollection: ConsumerCollection, private channelProvider: OutputChannelProvider) {

        this.disposables.push(this.consumerCollection.onDidChangeCollection((event: ConsumerCollectionChangedEvent) => {
            for (const startedUri of event.created) {
                this.showConsumer(startedUri);
                this.onDidChangeStatus(startedUri, 'started');
                this.attachToConsumer(startedUri);
            }

            for (const closedUri of event.closed) {
                this.onDidCloseConsumer(closedUri);
            }
        }));
    }

    private showConsumer(uri: vscode.Uri): void {
        let consumer = this.kafkaConsumers[uri.toString()];
        if (!consumer) {
            consumer = new ConsumerOutput(uri, this);
            this.kafkaConsumers[uri.toString()] = consumer;
            consumer.show();
        }
    }

    public dispose(): void {
        this.consumerCollection.dispose();
        this.disposables.forEach(d => d.dispose());
    }


    private attachToConsumer(uri: vscode.Uri): void {
        const consumer = this.consumerCollection.get(uri);

        if (consumer === null) {
            return;
        }

        this.disposables.push(consumer.onDidReceiveRecord((arg: RecordReceivedEvent) => {
            this.onDidReceiveRecord(arg.uri, arg.record);
        }));

        this.disposables.push(consumer.onDidChangeStatus((arg: ConsumerChangedStatusEvent) => {
            this.onDidChangeStatus(arg.uri, arg.status);
        }));
    }

    private onDidChangeStatus(uri: vscode.Uri, status: string): void {
        const consumer = this.kafkaConsumers[uri.toString()];
        if (consumer) {
            consumer.sendText(`Consumer: ${status}`);
        }
    }

    private onDidReceiveRecord(uri: vscode.Uri, message: ConsumedRecord): void {
        const consumer = this.kafkaConsumers[uri.toString()];
        if (consumer) {
            consumer.sendText(``);
            consumer.sendText(`Key: ${message.key}`);
            consumer.sendText(`Partition: ${message.partition}`);
            consumer.sendText(`Offset: ${message.offset}`);
            consumer.sendText(`Value:`);
            consumer.sendText(`${message.value}`);
        }
    }

    private onDidCloseConsumer(uri: vscode.Uri): void {
        this.onDidChangeStatus(uri, 'closed');
    }

    disposeConsumer(uri: vscode.Uri): void {
        delete this.kafkaConsumers[uri.toString()];
        if (this.consumerCollection.has(uri)) {
            this.consumerCollection.close(uri);
        }
    }

}
