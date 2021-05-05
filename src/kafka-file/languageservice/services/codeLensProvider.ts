import { TextDocument, CodeLens, Range } from "vscode";
import { ClientState, ConsumerLaunchState } from "../../../client";
import { createProducerUri, ProducerLaunchState } from "../../../client/producer";
import { SerializationSetting } from "../../../client/serialization";
import { LaunchConsumerCommand, ProduceRecordCommand, ProduceRecordCommandHandler, SelectClusterCommandHandler, StartConsumerCommandHandler, StopConsumerCommandHandler } from "../../../commands";
import { ProducerLaunchStateProvider, ConsumerLaunchStateProvider, SelectedClusterProvider } from "../kafkaFileLanguageService";
import { Block, BlockType, ConsumerBlock, KafkaFileDocument, CalleeFunction, ProducerBlock } from "../parser/kafkaFileParser";

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
                return `$(error) `;
            default:
                return '';
        }
    }

    private createProducerLens(block: ProducerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined, clusterState: ClientState | undefined): CodeLens[] {
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

    private createProduceRecordCommand(block: ProducerBlock, range: Range, clusterId: string): ProduceRecordCommand {
        let topicId;
        let key;
        let value = block.value?.content;
        let keyFormat;
        let keyFormatSettings: Array<SerializationSetting> | undefined;
        let valueFormat;
        let valueFormatSettings: Array<SerializationSetting> | undefined;
        block.properties.forEach(property => {
            switch (property.propertyName) {
                case 'topic':
                    topicId = property.propertyValue;
                    break;
                case 'key':
                    key = property.propertyValue;
                    break;
                case 'key-format': {
                    const callee = <CalleeFunction>property.value;
                    keyFormat = callee.functionName;
                    keyFormatSettings = this.getSerializationSettings(callee);
                    break;
                }
                case 'value-format': {
                    const callee = <CalleeFunction>property.value;
                    valueFormat = callee.functionName;
                    valueFormatSettings = this.getSerializationSettings(callee);
                    break;
                }
            }
        });
        return {
            clusterId,
            topicId,
            key,
            value,
            messageKeyFormat: keyFormat,
            messageKeyFormatSettings: keyFormatSettings,
            messageValueFormat: valueFormat,
            messageValueFormatSettings: valueFormatSettings
        } as ProduceRecordCommand;
    }

    private getSerializationSettings(callee: CalleeFunction): SerializationSetting[] | undefined {
        const parameters = callee.parameters;
        if (parameters.length > 0) {
            return parameters.map(p => { return { value: p.value }; });
        }
    }

    private createConsumerLens(block: ConsumerBlock, lineRange: Range, range: Range, clusterName: string | undefined, clusterId: string | undefined, clusterState: ClientState | undefined): CodeLens[] {
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

    private createLaunchConsumerCommand(block: ConsumerBlock, range: Range, selectedClusterId: string | undefined): LaunchConsumerCommand {
        let consumerGroupId = block.consumerGroupId?.content;
        let topicId;
        let partitions;
        let offset;
        let keyFormat;
        let keyFormatSettings;
        let valueFormat;
        let valueFormatSettings;
        block.properties.forEach(property => {
            switch (property.propertyName) {
                case 'topic':
                    topicId = property.propertyValue;
                    break;
                case 'from':
                    offset = property.propertyValue;
                    break;
                case 'partitions':
                    partitions = property.propertyValue;
                    break;
                case 'key-format': {
                    const callee = <CalleeFunction>property.value;
                    keyFormat = callee.functionName;
                    keyFormatSettings = this.getSerializationSettings(callee);
                    break;
                }
                case 'value-format': {
                    const callee = <CalleeFunction>property.value;
                    valueFormat = callee.functionName;
                    valueFormatSettings = this.getSerializationSettings(callee);
                    break;
                }
            }
        });

        return {
            clusterId: selectedClusterId,
            consumerGroupId,
            topicId: topicId || '',
            fromOffset: offset,
            partitions,
            messageKeyFormat: keyFormat,
            messageValueFormat: valueFormat,
            messageKeyFormatSettings: keyFormatSettings,
            messageValueFormatSettings: valueFormatSettings
        } as LaunchConsumerCommand;
    }
}
