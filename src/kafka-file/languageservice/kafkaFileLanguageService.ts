import { CodeAction, CodeActionContext, CodeLens, CompletionList, Diagnostic, FoldingRange, Hover, Position, TextDocument, Uri } from "vscode";
import { ClientState, ConsumerLaunchState } from "../../client";
import { BrokerConfigs } from "../../client/config";
import { ProducerLaunchState } from "../../client/producer";
import { executeInlineCommand } from "./inlineCommandActivation";
import { KafkaFileDocument, parseKafkaFile } from "./parser/kafkaFileParser";
import { KafkaFileCodeLenses } from "./services/codeLensProvider";
import { KafkaFileCodeActions } from "./services/codeActions";
import { KafkaFileCompletion } from "./services/completion";
import { KafkaFileDiagnostics } from "./services/diagnostics";
import { KafkaFileFoldingRanges } from "./services/foldingRangeProvider";
import { KafkaFileHover } from "./services/hover";

/**
 * Provider API which gets the state for a given producer.
 */
export interface ProducerLaunchStateProvider {
    getProducerLaunchState(uri: Uri): ProducerLaunchState;
}

/**
 * Provider API which gets the state for a given consumer.
 */
export interface ConsumerLaunchStateProvider {
    getConsumerLaunchState(clusterId: string, consumerGroupId: string): ConsumerLaunchState;
}

/**
 * Provider API which gets the selected cluster id and name.
 */
export interface SelectedClusterProvider {
    getSelectedCluster(): { clusterId?: string, clusterName?: string, clusterState?: ClientState };
}

export interface TopicDetail {
    id: string;
    partitionCount: number;
    replicationFactor: number;
}

/**
 * Provider API which gets topics from  given cluster id.
 */
export interface TopicProvider {

    getAutoCreateTopicEnabled(clusterid: string): Promise<BrokerConfigs.AutoCreateTopicResult>;
    getTopic(clusterId: string, topicId: string): Promise<TopicDetail | undefined>
    getTopics(clusterid: string): Promise<TopicDetail[]>;
}

/**
 * Kafka language service API.
 *
 */
export interface LanguageService {

    /**
     * Parse the given text document and returns an AST.
     *
     * @param document the text document of a kafka file.
     *
     * @returns the parsed AST.
     */
    parseKafkaFileDocument(document: TextDocument): KafkaFileDocument;

    /**
     * Returns the code lenses for the given text document and parsed AST.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     *
     * @returns the code lenses.
     */
    getCodeLenses(document: TextDocument, kafkaFileDocument: KafkaFileDocument): CodeLens[];

    /**
     * Returns the completion result for the given text document and parsed AST at given position.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     * @param producerFakerJSEnabled true if FakerJS is enabled and false otherwise.
     * @param position the position where the completion was triggered.
     */
    doComplete(document: TextDocument, kafkaFileDocument: KafkaFileDocument, producerFakerJSEnabled: boolean, position: Position): Promise<CompletionList | undefined>;

    /**
     * Returns the diagnostics result for the given text document and parsed AST.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     */
    doDiagnostics(document: TextDocument, kafkaFileDocument: KafkaFileDocument, producerFakerJSEnabled: boolean): Promise<Diagnostic[]>;

    /**
     * Returns the hover result for the given text document and parsed AST at given position.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     * @param position the position where the hover was triggered.
     */
    doHover(document: TextDocument, kafkaFileDocument: KafkaFileDocument, position: Position): Promise<Hover | undefined>;

    /**
     * Returns the folding ranges for the given text document and parsed AST.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     */
    getFoldingRanges(document: TextDocument, kafkaFileDocument: KafkaFileDocument): FoldingRange[];

    /**
     * Returns the code actions for the given text document and parsed AST.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     * @param context the code action context.
     */
    getCodeActions(document: TextDocument, kafkaFileDocument: KafkaFileDocument, context: CodeActionContext): CodeAction[];

    /**
     * Executes the currently selected block
     * 
     * @param document 
     * @param kafkaFileDocument 
     */
    executeInlineCommand(kafkaFileDocument: KafkaFileDocument): Promise<void>;
}

/**
 * Returns the Kafka file language service which manages codelens, completion, validation features for kafka file.
 *
 * @param producerLaunchStateProvider the provider which gets the state for a given producer.
 * @param consumerLaunchStateProvider the provider which gets the state for a given consumer.
 * @param selectedClusterProvider the provider which gets the selected cluster id and name.
 * @param topicProvider the provider which returns topics from a given cluster id.
 */
export function getLanguageService(producerLaunchStateProvider: ProducerLaunchStateProvider, consumerLaunchStateProvider: ConsumerLaunchStateProvider, selectedClusterProvider: SelectedClusterProvider, topicProvider: TopicProvider): LanguageService {

    const codeLenses = new KafkaFileCodeLenses(producerLaunchStateProvider, consumerLaunchStateProvider, selectedClusterProvider);
    const completion = new KafkaFileCompletion(selectedClusterProvider, topicProvider);
    const diagnostics = new KafkaFileDiagnostics(selectedClusterProvider, topicProvider);
    const foldingRanges = new KafkaFileFoldingRanges();
    const hover = new KafkaFileHover(selectedClusterProvider, topicProvider);
    const codeActions = new KafkaFileCodeActions();
    return {
        parseKafkaFileDocument: (document: TextDocument) => parseKafkaFile(document),
        getCodeLenses: codeLenses.getCodeLenses.bind(codeLenses),
        doComplete: completion.doComplete.bind(completion),
        doDiagnostics: diagnostics.doDiagnostics.bind(diagnostics),
        doHover: hover.doHover.bind(hover),
        getFoldingRanges: foldingRanges.getFoldingRanges.bind(foldingRanges),
        getCodeActions: codeActions.getCodeActions.bind(codeActions),
        executeInlineCommand: async (kafkaFileDocument) => {
            const { clusterId } = selectedClusterProvider.getSelectedCluster();
            if (!clusterId) {
                return;
            }
            executeInlineCommand(kafkaFileDocument, clusterId, consumerLaunchStateProvider);
        },
    };
}

export function createTopicDocumentation(topic: TopicDetail): string {
    return `Topic \`${topic.id}\`\n` +
        ` * partition count: \`${topic.partitionCount}\`\n` +
        ` * replication factor: \`${topic.replicationFactor}\`\n`;
}
