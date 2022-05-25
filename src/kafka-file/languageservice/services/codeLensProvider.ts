import { CodeLens, Range, TextDocument } from "vscode";
import { ClientState, ConsumerLaunchState } from "../../../client";
import { createProducerUri, ProducerLaunchState } from "../../../client/producer";
import { ProduceRecordCommandHandler, SelectClusterCommandHandler, StartConsumerCommandHandler, StopConsumerCommandHandler } from "../../../commands";
import { ConsumerLaunchStateProvider, ProducerLaunchStateProvider, SelectedClusterProvider } from "../kafkaFileLanguageService";
import { Block, BlockType, ConsumerBlock, KafkaFileDocument, ProducerBlock } from "../parser/kafkaFileParser";

/**
 * Kafka file codeLens support.
 */
export class KafkaFileCodeLenses {

    constructor(private producerLaunchStateProvider: ProducerLaunchStateProvider, private consumerLaunchStateProvider: ConsumerLaunchStateProvider, private selectedClusterProvider: SelectedClusterProvider) {

    }
    getCodeLenses(document: TextDocument, kafkaFileDocument: KafkaFileDocument): CodeLens[] {
        const lenses: CodeLens[] = [];
        const { clusterName, clusterId, clusterState } = this.selectedClusterProvider.getSelectedCluster();
        kafkaFileDocument.blocks.forEach(block => {
            lenses.push(...this.createBlockLens(block, clusterName, clusterId, clusterState));
        });
        return lenses;
    }


    private createBlockLens(block: Block, clusterName: string | undefined, clusterId: string | undefined, clusterState: ClientState | undefined): CodeLens[] {
        const range = new Range(block.start, block.end);
        const lineRange = new Range(block.start, block.start);
        if (block.type === BlockType.consumer) {
            return this.createConsumerLens(<ConsumerBlock>block, lineRange, range, clusterName, clusterId, clusterState);
        }
        return this.createProducerLens(<ProducerBlock>block, lineRange, range, clusterName, clusterId, clusterState);
    }

    createClusterLens(lineRange: Range, clusterName: string | undefined, clusterState: ClientState | undefined): CodeLens {
        const status = this.getClusterStatus(clusterState);
        return new CodeLens(lineRange, {
            title: clusterName ? `${status}${clusterName}` : 'Select a cluster',
            command: SelectClusterCommandHandler.commandId
        });
    }

    getClusterStatus(state: ClientState | undefined) {
        switch (state) {
            case ClientState.disconnected:
                return `$(eye-closed) `;
            case ClientState.connecting:
                return `$(sync~spin) `;
            case ClientState.connected:
                return `$(eye) `;
            case ClientState.invalid:
                return `$(warning) `;
            default:
                return '';
        }
    }

    private createProducerLens(block: ProducerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined, clusterState: ClientState | undefined): CodeLens[] {
        const lenses: CodeLens[] = [];
        if (clusterId) {
            const produceRecordCommand = block.createCommand(clusterId);
            const producerUri = createProducerUri(produceRecordCommand);
            const producerState = this.producerLaunchStateProvider.getProducerLaunchState(producerUri);
            switch (producerState) {
                case ProducerLaunchState.connecting:
                case ProducerLaunchState.sending:
                    const status = this.getProducerStatus(producerState);
                    lenses.push(new CodeLens(lineRange, {
                        title: `$(sync~spin) ${status}...`,
                        command: ''
                    }));
                    break;
                default:
                    // Add Produce lenses
                    lenses.push(new CodeLens(lineRange, {
                        title: "$(run) Produce record",
                        command: ProduceRecordCommandHandler.commandId,
                        arguments: [produceRecordCommand, 1]
                    }));
                    lenses.push(new CodeLens(lineRange, {
                        title: "$(run-all) Produce record x 10",
                        command: ProduceRecordCommandHandler.commandId,
                        arguments: [produceRecordCommand, 10]
                    }));
                    break;
            }
        }
        // Add cluster lens
        lenses.push(this.createClusterLens(lineRange, clusterName, clusterState));
        return lenses;
    }

    private getProducerStatus(state: ProducerLaunchState): string {
        switch (state) {
            case ProducerLaunchState.connecting:
                return 'Connecting';
            case ProducerLaunchState.connected:
                return 'Connected';
            case ProducerLaunchState.sending:
                return 'Sending';
            case ProducerLaunchState.sent:
                return 'Sent';
            default:
                return '';
        }
    }

    private createConsumerLens(block: ConsumerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined, clusterState: ClientState | undefined): CodeLens[] {
        const launchCommand = block.createCommand(clusterId);
        const lenses: CodeLens[] = [];
        if (clusterName) {
            const consumerState = this.consumerLaunchStateProvider.getConsumerLaunchState(launchCommand.clusterId, launchCommand.consumerGroupId);

            // Add Start/Stop consumer lens
            switch (consumerState) {
                case ConsumerLaunchState.starting:
                case ConsumerLaunchState.closing:
                    const status = this.getConsumerStatus(consumerState);
                    lenses.push(new CodeLens(lineRange, {
                        title: `$(sync~spin) ${status}...`,
                        command: ''
                    }));
                    break;
                case ConsumerLaunchState.started:
                    lenses.push(new CodeLens(lineRange, {
                        title: `$(debug-stop) Stop consumer`,
                        command: StopConsumerCommandHandler.commandId,
                        arguments: [launchCommand]
                    }));
                    break;
                default:
                    lenses.push(new CodeLens(lineRange, {
                        title: `$(debug-start) Start consumer`,
                        command: StartConsumerCommandHandler.commandId,
                        arguments: [launchCommand]
                    }));
                    break;
            }
        }
        // Add cluster lens
        lenses.push(this.createClusterLens(lineRange, clusterName, clusterState));
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
}
