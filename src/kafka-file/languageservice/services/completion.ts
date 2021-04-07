import { TextDocument, Position, CompletionList, CompletionItem, SnippetString, MarkdownString, CompletionItemKind, Range } from "vscode";
import { consumerProperties, fakerjsAPI, ModelDefinition, producerProperties } from "../model";
import { Block, BlockType, Chunk, ConsumerBlock, KafkaFileDocument, MustacheExpression, NodeKind, ProducerBlock, Property } from "../parser/kafkaFileParser";

export class KafkaFileCompletion {

    doComplete(document: TextDocument, kafkaFileDocument: KafkaFileDocument, position: Position): CompletionList | undefined {
        const node = kafkaFileDocument.findNodeBefore(position);
        if (!node) {
            return;
        }

        const items: Array<CompletionItem> = [];
        switch (node.kind) {
            case NodeKind.consumerBlock: {
                if (node.start.line !== position.line) {
                    // CONSUMER
                    // |
                    const lineRange = document.lineAt(position.line).range;
                    this.collectConsumerPropertyNames(undefined, lineRange, <ConsumerBlock>node, items);
                }
                break;
            }
            case NodeKind.producerBlock: {
                if (node.start.line !== position.line) {
                    // PRODUCER
                    // |
                    const lineRange = document.lineAt(position.line).range;
                    this.collectProducerPropertyNames(undefined, lineRange, <ProducerBlock>node, items);
                }
                break;
            }
            case NodeKind.producerValue: {
                // Check if previous line is a property
                const previous = new Position(position.line - 1, 1);
                const previousNode = kafkaFileDocument.findNodeBefore(previous);
                if (previousNode && previousNode.kind !== NodeKind.producerValue) {
                    const lineRange = document.lineAt(position.line).range;
                    const block = (previousNode.kind === NodeKind.producerBlock) ? <ProducerBlock>previousNode : <ProducerBlock>previousNode.parent;
                    this.collectProducerPropertyNames(undefined, lineRange, block, items);
                }
                break;
            }
            case NodeKind.propertyKey: {
                const propertyKey = <Chunk>node;
                const block = <Block>propertyKey.parent;
                const lineRange = document.lineAt(position.line).range;
                const propertyName = propertyKey.content;
                if (block.type === BlockType.consumer) {
                    this.collectConsumerPropertyNames(propertyName, lineRange, <ConsumerBlock>block, items);
                } else {
                    this.collectProducerPropertyNames(propertyName, lineRange, <ProducerBlock>block, items);
                }
                break;
            }
            case NodeKind.propertyValue: {
                const propertyValue = <Chunk>node;
                const property = <Property>propertyValue.parent;
                const block = <Block>propertyValue.parent;
                if (block.type === BlockType.consumer) {
                    this.collectConsumerPropertyValues(propertyValue, property, <ConsumerBlock>block, items);
                } else {
                    this.collectProducerPropertyValues(propertyValue, property, <ProducerBlock>block, items);
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
                        this.collectConsumerPropertyNames(propertyName, lineRange, <ConsumerBlock>block, items);
                    } else {
                        this.collectProducerPropertyNames(propertyName, lineRange, <ProducerBlock>block, items);
                    }
                } else {
                    const propertyValue = property.value;
                    const expression = propertyValue?.findNodeBefore(position);
                    if (expression && expression.kind === NodeKind.mustacheExpression) {
                        this.collectFakerJSExpression(<MustacheExpression>expression, items);
                    } else {
                        const block = <Block>property.parent;
                        if (block.type === BlockType.consumer) {
                            this.collectConsumerPropertyValues(propertyValue, property, <ConsumerBlock>block, items);
                        } else {
                            this.collectProducerPropertyValues(propertyValue, property, <ProducerBlock>block, items);
                        }
                    }
                }
                break;
            }
            case NodeKind.mustacheExpression: {
                const expression = <MustacheExpression>node;
                this.collectFakerJSExpression(expression, items);
                break;
            }
        }
        return new CompletionList(items, true);
    }

    collectConsumerPropertyNames(propertyName: string | undefined, lineRange: Range, block: ConsumerBlock, items: Array<CompletionItem>) {
        this.collectPropertyNames(propertyName, lineRange, block, consumerProperties, items);
    }

    collectProducerPropertyNames(propertyName: string | undefined, lineRange: Range, block: ProducerBlock, items: Array<CompletionItem>) {
        this.collectPropertyNames(propertyName, lineRange, block, producerProperties, items);
    }

    collectPropertyNames(propertyName: string | undefined, lineRange: Range, block: Block, metadata: ModelDefinition[], items: Array<CompletionItem>) {
        const existingProperties = block.properties
            .filter(property => property.key)
            .map(property => property.key?.content);
        metadata.forEach((definition) => {
            const currentName = definition.name;
            if (existingProperties.indexOf(currentName) === -1 || propertyName === currentName) {
                const item = new CompletionItem(currentName);
                item.kind = CompletionItemKind.Property;
                if (definition.description) {
                    item.documentation = new MarkdownString(definition.description);
                }
                const insertText = new SnippetString(`${currentName}: `);
                if (definition.enum) {
                    insertText.appendChoice(definition.enum.map(item => item.name));
                } else {
                    insertText.appendPlaceholder(currentName);
                }
                item.insertText = insertText;
                item.range = lineRange;
                items.push(item);
            }
        });
    }

    collectConsumerPropertyValues(propertyValue: Chunk | undefined, property: Property, block: ConsumerBlock, items: Array<CompletionItem>) {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':

                break;

            default:
                this.collectPropertyValues(propertyValue, property, block, consumerProperties, items);
                break;
        }
    }

    collectProducerPropertyValues(propertyValue: Chunk | undefined, property: Property, block: ProducerBlock, items: Array<CompletionItem>) {
        const propertyName = property.propertyName;
        switch (propertyName) {
            case 'topic':

                break;

            default:
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

    collectFakerJSExpression(expression: MustacheExpression, items: CompletionItem[]) {
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
}
