import { TextDocument, Position, CompletionList, CompletionItem, SnippetString, MarkdownString, CompletionItemKind, Range } from "vscode";
import { SelectedClusterProvider, TopicDetail, TopicProvider } from "../kafkaFileLanguageService";
import { consumerProperties, fakerjsAPI, ModelDefinition, producerProperties } from "../model";
import { Block, BlockType, Chunk, ConsumerBlock, KafkaFileDocument, MustacheExpression, NodeKind, ProducerBlock, Property } from "../parser/kafkaFileParser";

/**
 * Kafka file completion support.
 */
export class KafkaFileCompletion {

    constructor(private selectedClusterProvider: SelectedClusterProvider, private topicProvider: TopicProvider) {

    }
    async doComplete(document: TextDocument, kafkaFileDocument: KafkaFileDocument, position: Position): Promise<CompletionList | undefined> {
        // Get the AST node before the position where complation was triggered
        const node = kafkaFileDocument.findNodeBefore(position);
        if (!node) {
            return;
        }

        // Following comments with use the '|' character to show the position where the complation is trigerred
        const items: Array<CompletionItem> = [];
        switch (node.kind) {
            case NodeKind.consumerBlock: {
                if (node.start.line !== position.line) {
                    // CONSUMER
                    // |
                    const lineRange = document.lineAt(position.line).range;
                    await this.collectConsumerPropertyNames(undefined, lineRange, <ConsumerBlock>node, items);
                }
                break;
            }
            case NodeKind.producerBlock: {
                if (node.start.line !== position.line) {
                    // PRODUCER
                    // |
                    const lineRange = document.lineAt(position.line).range;
                    await this.collectProducerPropertyNames(undefined, lineRange, <ProducerBlock>node, items);
                }
                break;
            }
            case NodeKind.producerValue: {
                // Check if previous line is a property
                const previous = new Position(position.line - 1, 1);
                const previousNode = kafkaFileDocument.findNodeBefore(previous);
                if (previousNode && previousNode.kind !== NodeKind.producerValue) {
                    // PRODUCER
                    // topic: abcd
                    // |

                    // or

                    // PRODUCER
                    // to|pic
                    const lineRange = document.lineAt(position.line).range;
                    const block = (previousNode.kind === NodeKind.producerBlock) ? <ProducerBlock>previousNode : <ProducerBlock>previousNode.parent;
                    await this.collectProducerPropertyNames(undefined, lineRange, block, items);
                }
                break;
            }
            case NodeKind.property: {
                const property = <Property>node;
                const block = <Block>property.parent;
                if (property.isBeforeAssigner(position)) {
                    const propertyName = position.line === property.start.line ? property.propertyName : undefined;
                    const lineRange = document.lineAt(position.line).range;
                    if (block.type === BlockType.consumer) {
                        // CONSUMER
                        // key|:

                        // or

                        // CONSUMER
                        // key|
                        await this.collectConsumerPropertyNames(propertyName, lineRange, <ConsumerBlock>block, items);
                    } else {
                        // PRODUCER
                        // key|:
                        await this.collectProducerPropertyNames(propertyName, lineRange, <ProducerBlock>block, items);
                    }
                } else {
                    const propertyValue = property.value;
                    const expression = propertyValue?.findNodeBefore(position);
                    if (expression && expression.kind === NodeKind.mustacheExpression) {
                        // Completion was triggered inside a mustache expression which is inside the property value

                        // PRODUCER
                        // key: abcd-{{|}}
                        this.collectFakerJSExpressions(<MustacheExpression>expression, items);
                    } else {
                        const block = <Block>property.parent;
                        if (block.type === BlockType.consumer) {
                            // CONSUMER
                            // key-format: |
                            await this.collectConsumerPropertyValues(propertyValue, property, <ConsumerBlock>block, items);
                        } else {
                            // PRODUCER
                            // key-format: |
                            await this.collectProducerPropertyValues(propertyValue, property, <ProducerBlock>block, items);
                        }
                    }
                }
                break;
            }
            case NodeKind.mustacheExpression: {
                // Completion was triggered inside a mustache expression which is inside the PRODUCER value

                // PRODUCER
                // topic: abcd
                // {{|}}
                const expression = <MustacheExpression>node;
                this.collectFakerJSExpressions(expression, items);
                break;
            }
        }
        return new CompletionList(items, true);
    }

    async collectConsumerPropertyNames(propertyName: string | undefined, lineRange: Range, block: ConsumerBlock, items: Array<CompletionItem>) {
        await this.collectPropertyNames(propertyName, lineRange, block, consumerProperties, items);
    }

    async collectProducerPropertyNames(propertyName: string | undefined, lineRange: Range, block: ProducerBlock, items: Array<CompletionItem>) {
        await this.collectPropertyNames(propertyName, lineRange, block, producerProperties, items);
    }

    async collectPropertyNames(propertyName: string | undefined, lineRange: Range, block: Block, metadata: ModelDefinition[], items: Array<CompletionItem>) {
        const existingProperties = block.properties
            .filter(property => property.key)
            .map(property => property.key?.content);
        for (const definition of metadata) {
            const currentName = definition.name;
            if (existingProperties.indexOf(currentName) === -1 || propertyName === currentName) {
                const item = new CompletionItem(currentName);
                item.kind = CompletionItemKind.Property;
                if (definition.description) {
                    item.documentation = new MarkdownString(definition.description);
                }
                const insertText = new SnippetString(`${currentName}: `);
                const values = await this.getValues(definition);
                if (values) {
                    insertText.appendChoice(values);
                } else {
                    insertText.appendPlaceholder(currentName);
                }
                item.insertText = insertText;
                item.range = lineRange;
                items.push(item);
            }
        };
    }

    async collectConsumerPropertyValues(propertyValue: Chunk | undefined, property: Property, block: ConsumerBlock, items: Array<CompletionItem>) {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':
                // CONSUMER
                // topic: |
                await this.collectTopics(property, items);
                break;
            default:
                // CONSUMER
                // key-format: |
                this.collectPropertyValues(propertyValue, property, block, consumerProperties, items);
                break;
        }
    }

    async collectProducerPropertyValues(propertyValue: Chunk | undefined, property: Property, block: ProducerBlock, items: Array<CompletionItem>) {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':
                // PRODUCER
                // topic: |
                await this.collectTopics(property, items);
                break;
            default:
                // PRODUCER
                // key-format: |
                this.collectPropertyValues(propertyValue, property, block, producerProperties, items);
                break;
        }
    }

    collectPropertyValues(propertyValue: Chunk | undefined, property: Property, block: Block, metadata: ModelDefinition[], items: Array<CompletionItem>) {
        const propertyName = property.propertyName;
        const definition = metadata.find(definition => definition.name === propertyName);
        if (!definition || !definition.enum) {
            return;
        }

        const valueRange = property.propertyValueRange;
        definition.enum.forEach((definition) => {
            const value = definition.name;
            const item = new CompletionItem(value);
            item.kind = CompletionItemKind.Value;
            if (definition.description) {
                item.documentation = new MarkdownString(definition.description);
            }
            const insertText = new SnippetString(' ');
            insertText.appendText(value);
            item.insertText = insertText;
            item.range = valueRange;
            items.push(item);
        });
    }

    collectFakerJSExpressions(expression: MustacheExpression, items: CompletionItem[]) {
        const expressionRange = expression.expressionRange;
        fakerjsAPI.forEach((definition) => {
            const value = definition.name;
            const item = new CompletionItem(value);
            item.kind = CompletionItemKind.Variable;
            if (definition.description) {
                item.documentation = new MarkdownString(definition.description);
            }
            const insertText = new SnippetString('');
            insertText.appendText(value);
            item.insertText = insertText;
            item.range = expressionRange;
            items.push(item);
        });
    }

    async collectTopics(property: Property, items: Array<CompletionItem>) {
        const { clusterId } = this.selectedClusterProvider.getSelectedCluster();
        if (!clusterId) {
            return;
        }

        function createDocumentation(topic: TopicDetail): string {
            return `Topic \`${topic.id}\`\n` +
                ` * partition count: \`${topic.partitionCount}\`\n` +
                ` * replication factor: \`${topic.replicationFactor}\`\n`;
        }
        const valueRange = property.propertyValueRange;
        try {
            const topics = await this.topicProvider.getTopics(clusterId);
            topics.forEach((topic) => {
                const value = topic.id;
                const item = new CompletionItem(value);
                item.kind = CompletionItemKind.Value;
                item.documentation = new MarkdownString(createDocumentation(topic));
                const insertText = new SnippetString(' ');
                insertText.appendText(value);
                item.insertText = insertText;
                item.range = valueRange;
                items.push(item);
            });
        }
        catch (e) {

        }
    }

    async getValues(definition: ModelDefinition): Promise<string[] | undefined> {
        if (definition.enum) {
            return definition.enum.map(item => item.name);
        }
        if (definition.name === 'topic') {
            // TODO : manage list of topics as choices, but how to handle when cluster is not available?
            /*const { clusterId } = this.selectedClusterProvider.getSelectedCluster();
            if (clusterId) {
                try {
                    const topics = await this.topicProvider.getTopics(clusterId);
                    if (topics.length > 0) {
                        return topics.map(item => item.id);
                    }
                }
                catch (e) {
                    return;
                }
            }*/
        }
    }
}
