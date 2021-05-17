import { CodeLens, CompletionList, Diagnostic, DocumentLink, Hover, Position, TextDocument, Uri } from "vscode";
import { ClientState, ConsumerLaunchState } from "../../client";
import { BrokerConfigs } from "../../client/config";
import { ProducerLaunchState } from "../../client/producer";
import { CalleeFunction, KafkaFileDocument, parseKafkaFile, Property } from "./parser/kafkaFileParser";
import { KafkaFileCodeLenses } from "./services/codeLensProvider";
import { KafkaFileCompletion } from "./services/completion";
import { KafkaFileDiagnostics } from "./services/diagnostics";
import { KafkaFileDocumentLinks } from "./services/documentLinks";
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
     * Returns the document links for the given text document and parsed AST.
     *
     * @param document the text document.
     * @param kafkaFileDocument the parsed AST.
     */
    provideDocumentLinks(document: TextDocument, kafkaFileDocument: KafkaFileDocument): Promise<DocumentLink[]>;
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
    const hover = new KafkaFileHover(selectedClusterProvider, topicProvider);
    const links = new KafkaFileDocumentLinks();
    return {
        parseKafkaFileDocument: (document: TextDocument) => parseKafkaFile(document),
        getCodeLenses: codeLenses.getCodeLenses.bind(codeLenses),
        doComplete: completion.doComplete.bind(completion),
        doDiagnostics: diagnostics.doDiagnostics.bind(diagnostics),
        doHover: hover.doHover.bind(hover),
        provideDocumentLinks: links.provideDocumentLinks.bind(links)
    };
}

export function getAvroCalleeFunction(property: Property): CalleeFunction | undefined {
    if (property.propertyName === 'key-format' || property.propertyName === 'value-format') {
        const callee = <CalleeFunction>property.value;
        if (callee && callee.functionName === 'avro') {
            return callee;
        }
    }
}
export function createTopicDocumentation(topic: TopicDetail): string {
    return `Topic \`${topic.id}\`\n` +
        ` * partition count: \`${topic.partitionCount}\`\n` +
        ` * replication factor: \`${topic.replicationFactor}\`\n`;
}