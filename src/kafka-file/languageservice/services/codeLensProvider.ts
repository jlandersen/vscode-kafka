import { TextDocument, CodeLens, Range } from "vscode";
import { ConsumerLaunchState } from "../../../client";
import { createProducerUri, ProducerLaunchState } from "../../../client/producer";
import { LaunchConsumerCommand, ProduceRecordCommand, ProduceRecordCommandHandler, SelectClusterCommandHandler, StartConsumerCommandHandler, StopConsumerCommandHandler } from "../../../commands";
import { ProducerLaunchStateProvider, ConsumerLaunchStateProvider, SelectedClusterProvider } from "../kafkaFileLanguageService";
import { Block, BlockType, ConsumerBlock, KafkaFileDocument, ProducerBlock } from "../parser/kafkaFileParser";

/**
 * Kafka file codeLens support.
 */
export class KafkaFileCodeLenses {

    constructor(private producerLaunchStateProvider: ProducerLaunchStateProvider, private consumerLaunchStateProvider: ConsumerLaunchStateProvider, private selectedClusterProvider: SelectedClusterProvider) {

    }
    getCodeLenses(document: TextDocument, kafkaFileDocument: KafkaFileDocument): CodeLens[] {
        const lenses: CodeLens[] = [];
        const { clusterName, clusterId } = this.selectedClusterProvider.getSelectedCluster();
        kafkaFileDocument.blocks.forEach(block => {
            lenses.push(...this.createBlockLens(block, clusterName, clusterId));
        });
        return lenses;
    }


    private createBlockLens(block: Block, clusterName: string | undefined, clusterId: string | undefined): CodeLens[] {
        const range = new Range(block.start, block.end);
        const lineRange = new Range(block.start, block.start);
        if (block.type === BlockType.consumer) {
            return this.createConsumerLens(<ConsumerBlock>block, lineRange, range, clusterName, clusterId);
        }
        return this.createProducerLens(<ProducerBlock> block, lineRange, range, clusterName, clusterId);
    }

    createClusterLens(lineRange: Range, clusterName: string | undefined): CodeLens {
        return new CodeLens(lineRange, {
            title: clusterName ? `${clusterName}` : 'Select a cluster',
            command: SelectClusterCommandHandler.commandId
        });
    }

    private createProducerLens(block: ProducerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined): CodeLens[] {
        const lenses: CodeLens[] = [];
        if (clusterId) {
            const produceRecordCommand = this.createProduceRecordCommand(block, range, clusterId);
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
        lenses.push(this.createClusterLens(lineRange, clusterName));
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

    private createProduceRecordCommand(block: ProducerBlock, range: Range, clusterId: string): ProduceRecordCommand {
        let topicId;
        let key;
        let value = block.value?.content;
        let keyFormat;
        let valueFormat;
        block.properties.forEach(property => {
            switch (property.propertyName) {
                case 'topic':
                    topicId = property.propertyValue;
                    break;
                case 'key':
                    key = property.propertyValue;
                    break;
                case 'key-format':
                    keyFormat = property.propertyValue;
                    break;
                case 'value-format':
                    valueFormat = property.propertyValue;
                    break;
            }
        });
        return {
            clusterId,
            topicId,
            key,
            value,
            messageKeyFormat: keyFormat,
            messageValueFormat: valueFormat
        } as ProduceRecordCommand;
    }

    private createConsumerLens(block: ConsumerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined): CodeLens[] {
        const launchCommand = this.createLaunchConsumerCommand(block, range, clusterId);
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

    private createLaunchConsumerCommand(block: ConsumerBlock, range: Range, selectedClusterId: string | undefined): LaunchConsumerCommand {
        let consumerGroupId = block.consumerGroupId?.content;
        let topicId;
        let partitions;
        let offset;
        let keyFormat;
        let valueFormat;
        block.properties.forEach(property => {
            switch (property. propertyName) {
                case 'topic':
                    topicId = property.propertyValue;
                    break;
                case 'from':
                    offset = property.propertyValue;
                    break;
                case 'partitions':
                    partitions = property.propertyValue;
                    break;
                case 'key-format':
                    keyFormat = property.propertyValue;
                    break;
                case 'value-format':
                    valueFormat = property.propertyValue;
                    break;
            }
        });

        return {
            clusterId: selectedClusterId,
            consumerGroupId,
            topicId: topicId || '',
            fromOffset: offset,
            partitions,
            messageKeyFormat: keyFormat,
            messageValueFormat: valueFormat
        } as LaunchConsumerCommand;
    }
}
