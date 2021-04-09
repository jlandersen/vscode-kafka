import { CodeLens, CompletionList, Position, TextDocument, Uri } from "vscode";
import { ConsumerLaunchState } from "../../client";
import { ProducerLaunchState } from "../../client/producer";
import { KafkaFileDocument, parseKafkaFile } from "./parser/kafkaFileParser";
import { KafkaFileCodeLenses } from "./services/codeLensProvider";
import { KafkaFileCompletion } from "./services/completion";

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
    getSelectedCluster(): { clusterId?: string, clusterName?: string };
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
     * @param position the position where the completion was triggered.
     */
    doComplete(document: TextDocument, kafkaFileDocument: KafkaFileDocument, position: Position): Promise<CompletionList | undefined>
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

    const kafkaFileCodeLenses = new KafkaFileCodeLenses(producerLaunchStateProvider, consumerLaunchStateProvider, selectedClusterProvider);
    const kafkaFileCompletion = new KafkaFileCompletion(selectedClusterProvider, topicProvider);
    return {
        parseKafkaFileDocument: (document: TextDocument) => parseKafkaFile(document),
        getCodeLenses: kafkaFileCodeLenses.getCodeLenses.bind(kafkaFileCodeLenses),
        doComplete: kafkaFileCompletion.doComplete.bind(kafkaFileCompletion)
    };
}
