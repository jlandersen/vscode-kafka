import * as vscode from "vscode";
import { ConsumerCollection, ConsumerCollectionChangedEvent, ConsumerLaunchState } from "../client";
import { LaunchConsumerCommand, StartConsumerCommandHandler, StopConsumerCommandHandler, ProduceRecordCommand, ProduceRecordCommandHandler, SelectClusterCommandHandler } from "../commands";
import { ClusterSettings } from "../settings";

enum BlockType {
    producer = 'PRODUCER',
    consumer = 'CONSUMER'
}

export class KafkaFileCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {

    private disposables: vscode.Disposable[] = [];
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(
        private clusterSettings: ClusterSettings,
        private consumerCollection: ConsumerCollection
    ) {
        // Refresh the code lenses when:
        // 1. a consumer is started / stopped to refresh the status of each declared CONSUMER
        this.disposables.push(this.consumerCollection.onDidChangeCollection((e: ConsumerCollectionChangedEvent) => {
            this._onDidChangeCodeLenses.fire();
        }));
        // 2. a cluster is selected
        this.clusterSettings.onDidChangeSelected((e) => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];
        const clusterName = this.clusterSettings.selected?.name;
        // Create block PRODUCER / CONSUMER block codeLens
        let blockStartLine = 0;
        let blockEndLine = 0;
        let currentBlockType = undefined;
        for (let currentLine = 0; currentLine < document.lineCount; currentLine++) {
            const lineText = document.lineAt(currentLine).text;
            if (currentBlockType === undefined) {
                // Search start of PRODUCER / CONSUMER block
                const blockType = this.getBlockType(lineText);
                if (blockType !== undefined) {
                    blockStartLine = currentLine;
                    currentBlockType = blockType;
                    continue;
                }
            } else {
                // A PRODUCER / CONSUMER block is parsing, check if it's the end of the block
                if (this.isEndBlock(lineText, currentBlockType)) {
                    blockEndLine = currentLine - 1;
                    lenses.push(...this.createBlockLens(blockStartLine, blockEndLine, document, currentBlockType, clusterName));
                    if (currentBlockType === BlockType.consumer) {
                        currentBlockType = this.getBlockType(lineText);
                        if (currentBlockType !== undefined) {
                            blockStartLine = currentLine;
                        }
                    } else {
                        currentBlockType = undefined;
                    }
                    continue;
                }
            }
        }

        if (currentBlockType !== undefined) {
            lenses.push(...this.createBlockLens(blockStartLine, document.lineCount - 1, document, currentBlockType, clusterName));
        }

        return Promise.resolve(lenses);
    }

    private getBlockType(lineText: string): BlockType | undefined {
        if (lineText.startsWith(BlockType.producer.toString())) {
            return BlockType.producer;
        } else if (lineText.startsWith(BlockType.consumer.toString())) {
            return BlockType.consumer;
        }
        return undefined;
    }
    private isEndBlock(lineText: string, blockType: BlockType): boolean {
        if (blockType === BlockType.consumer) {
            return this.isSeparator(lineText) || this.getBlockType(lineText) !== undefined;
        }
        return this.isSeparator(lineText);
    }

    private isSeparator(lineText: string): boolean {
        return lineText === "###";
    }

    public dispose(): void {
        this.consumerCollection.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    private createBlockLens(blockStartLine: number, blockEndLine: number, document: vscode.TextDocument, blockType: BlockType, clusterName: string | undefined): vscode.CodeLens[] {
        const range = new vscode.Range(blockStartLine, 0, blockEndLine, 0);
        const lineRange = new vscode.Range(blockStartLine, 0, blockStartLine, 0);
        if (blockType === BlockType.consumer) {
            return this.createConsumerLens(lineRange, range, document, clusterName);
        }
        return this.createProducerLens(lineRange, range, document, clusterName);
    }

    createClusterLens(lineRange: vscode.Range, clusterName: string | undefined): vscode.CodeLens {
        return new vscode.CodeLens(lineRange, {
            title: clusterName ? `${clusterName}` : 'Select a cluster',
            command: SelectClusterCommandHandler.commandId
        });
    }

    private createProducerLens(lineRange: vscode.Range, range: vscode.Range, document: vscode.TextDocument, clusterName: string | undefined): vscode.CodeLens[] {
        const produceRecordCommand = this.createProduceRecordCommand(document, range);
        const lenses: vscode.CodeLens[] = [];
        if (clusterName) {
            // Add Produce lenses
            lenses.push(new vscode.CodeLens(lineRange, {
                title: "$(run) Produce record",
                command: ProduceRecordCommandHandler.commandId,
                arguments: [produceRecordCommand, 1]
            }));
            lenses.push(new vscode.CodeLens(lineRange, {
                title: "$(run-all) Produce record x 10",
                command: ProduceRecordCommandHandler.commandId,
                arguments: [produceRecordCommand, 10]
            }));
        }
        // Add cluster lens
        lenses.push(this.createClusterLens(lineRange, clusterName));
        return lenses;
    }

    private createProduceRecordCommand(document: vscode.TextDocument, range: vscode.Range): ProduceRecordCommand {
        let topicId;
        let key;
        let value = "";
        for (let currentLine = range.start.line + 1; currentLine <= range.end.line; currentLine++) {
            const lineText = document.lineAt(currentLine).text;

            if (lineText.startsWith("topic:")) {
                topicId = lineText.substr("topic:".length).trim();
                continue;
            }

            if (lineText.startsWith("key:")) {
                key = lineText.substr("key:".length).trim();
                continue;
            }

            if (lineText.startsWith("--")) {
                continue;
            }

            value = document.getText(new vscode.Range(currentLine, 0, range.end.line + 1, 0)).trim();
            break;
        }

        return {
            topicId,
            key,
            value,
        };
    }

    private createConsumerLens(lineRange: vscode.Range, range: vscode.Range, document: vscode.TextDocument, clusterName: string | undefined): vscode.CodeLens[] {
        const launchCommand = this.createLaunchConsumerCommand(document, range, this.clusterSettings.selected?.id);
        const lenses: vscode.CodeLens[] = [];
        if (clusterName) {
            const consumer = this.consumerCollection.getByConsumerGroupId(launchCommand.clusterId, launchCommand.consumerGroupId);
            const consumerState = consumer ? consumer.state : ConsumerLaunchState.none;

            // Add Start/Stop consumer lens
            switch (consumerState) {
                case ConsumerLaunchState.starting:
                case ConsumerLaunchState.closing:
                    const status = this.getConsumerStatus(consumerState);
                    lenses.push(new vscode.CodeLens(lineRange, {
                        title: `$(sync~spin) ${status}...`,
                        command: ''
                    }));
                    break;
                case ConsumerLaunchState.started:
                    lenses.push(new vscode.CodeLens(lineRange, {
                        title: `$(debug-stop) Stop consumer`,
                        command: StopConsumerCommandHandler.commandId,
                        arguments: [launchCommand]
                    }));
                    break;
                default:
                    lenses.push(new vscode.CodeLens(lineRange, {
                        title: `$(debug-start) Start consumer`,
                        command: StartConsumerCommandHandler.commandId,
                        arguments: [launchCommand]
                    }));
                    break;
            }
        }
        // Add cluster lens
        lenses.push(this.createClusterLens(lineRange, clusterName));
        return lenses;
    }

    private getConsumerStatus(state: ConsumerLaunchState): string {
        switch (state) {
            case ConsumerLaunchState.starting:
                return 'Starting';
            case ConsumerLaunchState.closing:
                return 'Stopping';
            case ConsumerLaunchState.started:
                return 'Started';
            default:
                return 'Stopped';
        }
    }

    private createLaunchConsumerCommand(document: vscode.TextDocument, range: vscode.Range, selectedClusterId: string | undefined): LaunchConsumerCommand {
        let consumerGroupId;
        let topicId;
        let partitions;
        let offset = "";
        let keyFormat;
        let valueFormat;
        for (let currentLine = range.start.line; currentLine <= range.end.line; currentLine++) {
            const lineText = document.lineAt(currentLine).text;

            if (currentLine === range.start.line) {
                consumerGroupId = lineText.substr("CONSUMER".length).trim();
                continue;
            }

            if (lineText.startsWith("topic:")) {
                topicId = lineText.substr("topic:".length).trim();
                continue;
            }

            if (lineText.startsWith("from:")) {
                offset = lineText.substr("from:".length).trim();
                continue;
            }

            if (lineText.startsWith("partitions:")) {
                partitions = lineText.substr("partitions:".length).trim();
                continue;
            }

            if (lineText.startsWith("key-format:")) {
                keyFormat = lineText.substr("key-format:".length).trim();
                continue;
            }

            if (lineText.startsWith("value-format:")) {
                valueFormat = lineText.substr("value-format:".length).trim();
                continue;
            }

            break;
        }
        return {
            clusterId: selectedClusterId,
            consumerGroupId,
            topicId,
            fromOffset: offset,
            partitions,
            messageKeyFormat: keyFormat,
            messageValueFormat: valueFormat
        } as LaunchConsumerCommand;
    }
}
