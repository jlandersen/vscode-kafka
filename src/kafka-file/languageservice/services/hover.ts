import { Hover, MarkdownString, Position, Range, TextDocument } from "vscode";
import { getDocumentationPageUri } from "../../../docs/markdownPreviewProvider";
import { createTopicDocumentation, SelectedClusterProvider, TopicProvider } from "../kafkaFileLanguageService";
import { consumerModel, Model, producerModel } from "../model";
import { Block, BlockType, Chunk, ConsumerBlock, KafkaFileDocument, MustacheExpression, NodeKind, ProducerBlock, Property } from "../parser/kafkaFileParser";

export class KafkaFileHover {

    constructor(private selectedClusterProvider: SelectedClusterProvider, private topicProvider: TopicProvider) {

    }

    async doHover(document: TextDocument, kafkaFileDocument: KafkaFileDocument, position: Position): Promise<Hover | undefined> {
        // Get the AST node before the position where complation was triggered
        const node = kafkaFileDocument.findNodeAt(position);
        if (!node) {
            return;
        }
        switch (node.kind) {

            case NodeKind.consumerBlock: {
                const block = <Block>node;
                const topic = block.getPropertyValue('topic');
                return createHover(`Consumer declaration${topic ? ` for topic \`${topic}\`` : ''}.\n\nSee [here](${getDocumentationPageUri('Consuming', 'kafka-file')}) for more informations.`, node.range());
            }

            case NodeKind.producerBlock: {
                const block = <Block>node;
                const topic = block.getPropertyValue('topic');
                return createHover(`Producer declaration${topic ? ` for topic \`${topic}\`` : ''}.\n\nSee [here](${getDocumentationPageUri('Producing', 'kafka-file')}) for more informations.`, node.range());
            }

            case NodeKind.propertyKey: {
                const propertyKey = <Chunk>node;
                const property = <Property>propertyKey.parent;
                const propertyName = propertyKey.content;
                const propertyKeyRange = propertyKey.range();
                const block = <Block>property.parent;
                if (block.type === BlockType.consumer) {
                    // CONSUMER
                    // key|:

                    // or

                    // CONSUMER
                    // key|
                    return await this.getHoverForConsumerPropertyNames(propertyName, propertyKeyRange, <ConsumerBlock>block);
                } else {
                    // PRODUCER
                    // key|:
                    return await this.getHoverForProducerPropertyNames(propertyName, propertyKeyRange, <ProducerBlock>block);
                }
            }

            case NodeKind.propertyValue: {
                const propertyValue = <Chunk>node;
                const property = <Property>propertyValue.parent;
                const block = <Block>property.parent;
                if (block.type === BlockType.consumer) {
                    // CONSUMER
                    // key-format: |
                    return await this.getHoverForConsumerPropertyValues(propertyValue, property, <ConsumerBlock>block);
                } else {
                    // PRODUCER
                    // key-format: |
                    return await this.getHoverForProducerPropertyValues(propertyValue, property, <ProducerBlock>block);
                }
            }

            case NodeKind.mustacheExpression: {
                const expression = <MustacheExpression>node;
                return createHover(`FakerJS expression.\n\nSee [here](${getDocumentationPageUri('Producing', 'randomized-content')}) for more informations.`, expression.enclosedExpressionRange);
            }

            case NodeKind.producerValue: {
                return createHover(`Producer value.\n\nSee [here](${getDocumentationPageUri('Producing', 'kafka-file')}) for more informations.`, node.range());
            }
        }
    }

    async getHoverForConsumerPropertyNames(propertyName: string, propertyKeyRange: Range, block: ConsumerBlock): Promise<Hover | undefined> {
        return await this.getHoverForPropertyNames(propertyName, propertyKeyRange, block, consumerModel);
    }

    async getHoverForProducerPropertyNames(propertyName: string, propertyKeyRange: Range, block: ProducerBlock): Promise<Hover | undefined> {
        return await this.getHoverForPropertyNames(propertyName, propertyKeyRange, block, producerModel);
    }

    async getHoverForPropertyNames(propertyName: string, propertyKeyRange: Range, block: Block, metadata: Model): Promise<Hover | undefined> {
        const definition = metadata.getDefinition(propertyName);
        if (definition && definition.description) {
            return createHover(definition.description, propertyKeyRange);
        }
    }

    async getHoverForConsumerPropertyValues(propertyValue: Chunk, property: Property, block: ConsumerBlock): Promise<Hover | undefined> {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':
                // CONSUMER
                // topic: |
                return await this.getHoverForTopic(property);
            default:
                // CONSUMER
                // key-format: |
                return await this.getHoverForPropertyValues(propertyValue, property, block, consumerModel);
        }
    }


    async getHoverForProducerPropertyValues(propertyValue: Chunk, property: Property, block: ProducerBlock): Promise<Hover | undefined> {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':
                // PRODUCER
                // topic: |
                return await this.getHoverForTopic(property);
            default:
                // PRODUCER
                // key-format: |
                return await this.getHoverForPropertyValues(propertyValue, property, block, producerModel);
        }
    }

    async getHoverForTopic(property: Property): Promise<Hover | undefined> {
        const propertyValue = property.value;
        if (!propertyValue) {
            return;
        }
        const { clusterId } = this.selectedClusterProvider.getSelectedCluster();
        if (!clusterId) {
            return;
        }

        try {
            const topicId = propertyValue.content.trim();
            const topics = await this.topicProvider.getTopics(clusterId);
            if (topics.length > 0) {
                const topic = topics
                    .find(t => t.id === topicId);
                if (topic) {
                    return createHover(createTopicDocumentation(topic), propertyValue.range());
                }
            }
        }
        catch (e) {
            return;
        }

        return undefined;
    }

    async getHoverForPropertyValues(propertyValue: Chunk, property: Property, block: Block, metadata: Model): Promise<Hover | undefined> {
        const propertyName = property.propertyName;
        if (!propertyName) {
            return;
        }
        const definition = metadata.getDefinitionEnum(propertyName, propertyValue.content.trim());
        if (definition && definition.description) {
            return createHover(definition.description, property.propertyTrimmedValueRange);
        }
        return undefined;
    }
}

function createHover(contents: string, range?: Range): Hover {
    const doc = new MarkdownString(contents);
    doc.isTrusted = true;
    return new Hover(doc, range);
}