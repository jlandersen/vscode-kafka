import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from "vscode";
import { Block, BlockType, ConsumerBlock, DynamicChunk, KafkaFileDocument, MustacheExpression, ProducerBlock, Property } from "../parser/kafkaFileParser";
import { ConsumerValidator } from "../../../validators/consumer";
import { ProducerValidator } from "../../../validators/producer";
import { CommonsValidator } from "../../../validators/commons";
import { fakerjsAPIModel, PartModelProvider } from "../model";
import { SelectedClusterProvider, TopicProvider } from "../kafkaFileLanguageService";
import { ClientState } from "../../../client";
import { BrokerConfigs } from "../../../client/config";

/**
 * Kafka file diagnostics support.
 */
export class KafkaFileDiagnostics {

    constructor(private selectedClusterProvider: SelectedClusterProvider, private topicProvider: TopicProvider) {

    }

    async doDiagnostics(document: TextDocument, kafkaFileDocument: KafkaFileDocument, producerFakerJSEnabled: boolean): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        for (const block of kafkaFileDocument.blocks) {
            if (block.type === BlockType.consumer) {
                await this.validateConsumerBlock(<ConsumerBlock>block, diagnostics);
            } else {
                await this.validateProducerBlock(<ProducerBlock>block, producerFakerJSEnabled, diagnostics);
            }
        }
        return diagnostics;
    }

    async validateConsumerBlock(block: ConsumerBlock, diagnostics: Diagnostic[]) {
        await this.validateProperties(block, false, diagnostics);
    }

    async validateProducerBlock(block: ProducerBlock, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        await this.validateProperties(block, producerFakerJSEnabled, diagnostics);
        this.validateProducerValue(block, producerFakerJSEnabled, diagnostics);
    }

    validateProducerValue(block: ProducerBlock, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        const value = block.value;
        // 1. Check if producer defines a value content
        const errorMessage = ProducerValidator.validateProducerValue(value?.content);
        if (errorMessage) {
            const range = new Range(block.start, new Position(block.start.line, block.start.character + 8));
            diagnostics.push(new Diagnostic(range, errorMessage, DiagnosticSeverity.Error));
        }
        // 2. Producer value can declare FakerJS expressions, validate them.
        if (producerFakerJSEnabled && value) {
            this.validateFakerJSExpressions(value, diagnostics);
        }
    }

    validateFakerJSExpressions(value: DynamicChunk, diagnostics: Diagnostic[]) {
        value.expressions.forEach(expression => {
            if (!expression.opened) {
                const range = expression.enclosedExpressionRange;
                diagnostics.push(new Diagnostic(range, `FakerJS expression '${expression.content}' must be opened with '{{'`, DiagnosticSeverity.Error));
                return;
            }

            if (!expression.closed) {
                const range = expression.enclosedExpressionRange;
                diagnostics.push(new Diagnostic(range, `FakerJS expression '${expression.content}' must be closed with '}}'`, DiagnosticSeverity.Error));
                return;
            }

            if (expression.unexpectedEdges.length > 0) {
                expression.unexpectedEdges.forEach(u => {
                    const position = u.position;
                    const range = new Range(position, new Position(position.line, position.character + 2));
                    diagnostics.push(new Diagnostic(range, `Unexpected token '${u.open ? '{{' : '}}'}' in expression '${expression.content}'`, DiagnosticSeverity.Error));
                });
                return;
            }

            // This following code follows the same behavior than FakerJS
            // See https://github.com/Marak/faker.js/blob/e073ace19cbf68857a5731dc3302fda0eb36cf24/lib/fake.js#L47

            const token = expression.content;
            let method = token; //.replace('}}', '').replace('{{', '');
            // extract method parameters
            const regExp = /\(([^)]+)\)/;
            const matches = regExp.exec(method);
            if (matches) {
                method = method.replace(regExp, '');
            }

            // validate each parts of FakerJS expression (ex : {{random.words}})
            const parts = method.split('.');

            // We should have 2 parts (module + '.' + method)
            if (!this.validateFakerPartsLength(expression, parts, diagnostics)) {
                return;
            }

            let parentPartModel = <PartModelProvider>fakerjsAPIModel;
            let offset = 0;
            // loop for each parts (ex : random, words) and validate it
            for (let i = 0; i < parts.length; i++) {
                let part = parts[i];
                if (i > 0) {
                    // increment offset for '.'
                    offset++;
                }
                // Check if the current part (ex : random) exists.
                const partModel = parentPartModel.getPart(part);
                if (!partModel) {
                    // The part doesn't exists, report an error.
                    const range = this.adjustExpressionRange(expression, offset, part.length);
                    diagnostics.push(new Diagnostic(range, `Invalid ${i === 0 ? 'module' : 'method'}: '${part}'`, DiagnosticSeverity.Error));
                    return;
                }
                offset += part.length;
                parentPartModel = partModel;
            }
        });
    }

    validateFakerPartsLength(expression: MustacheExpression, parts: string[], diagnostics: Diagnostic[]): boolean {
        if (parts.length === 2) {
            return true;
        }
        const content = expression.content;
        switch (parts.length) {
            case 1: {
                const range = expression.enclosedExpressionRange;
                const message = content.trim().length === 0 ? `Required expression` : `Missing '.' after '${content}'`;
                diagnostics.push(new Diagnostic(range, message, DiagnosticSeverity.Error));
                break;
            }
            default: {
                const validContent = parts.slice(0, 2).join('.');
                const startColumn = validContent.length + 1;
                const endColumn = content.length - startColumn;
                const invalidContent = content.substring(startColumn, content.length);
                const range = this.adjustExpressionRange(expression, startColumn, endColumn);
                diagnostics.push(new Diagnostic(range, `Invalid content: '${invalidContent}'`, DiagnosticSeverity.Error));
                break;
            }
        }
        return false;
    }

    adjustExpressionRange(expression: MustacheExpression, startColumn: number, endColumn: number): Range {
        const expressionRange = expression.enclosedExpressionRange;
        const start = new Position(expressionRange.start.line, expressionRange.start.character + startColumn);
        const end = new Position(expressionRange.end.line, start.character + endColumn);
        return new Range(start, end);
    }

    async validateProperties(block: Block, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        const existingProperties = new Map<string, Property[]>();
        let topicProperty: Property | undefined;
        for (const property of block.properties) {
            const propertyName = property.propertyName;
            this.validateProperty(property, block, producerFakerJSEnabled, diagnostics);
            if (propertyName === 'topic') {
                topicProperty = property;
            }
            if (propertyName) {
                let properties = existingProperties.get(propertyName);
                if (!properties) {
                    properties = [];
                    existingProperties.set(propertyName, properties);
                }
                properties.push(property);
            }
        }
        // Validate duplicate properties
        existingProperties.forEach((properties, propertyName) => {
            if (properties.length > 1) {
                properties.forEach(property => {
                    const range = property.propertyKeyRange;
                    diagnostics.push(new Diagnostic(range, `Duplicate property '${propertyName}'`, DiagnosticSeverity.Warning));
                });
            }
        });

        if (!topicProperty) {
            const range = new Range(block.start, new Position(block.start.line, block.start.character + 8));
            diagnostics.push(new Diagnostic(range, `The ${block.type === BlockType.consumer ? 'consumer' : 'producer'} must declare the 'topic:' property.`, DiagnosticSeverity.Error));
        } else {
            await this.validateTopic(topicProperty, block.type, diagnostics);
        }
    }

    validateProperty(property: Property, block: Block, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        const propertyName = property.propertyName;
        // 1. Validate property syntax
        this.validateSyntaxProperty(propertyName, property, diagnostics);

        if (propertyName) {
            const definition = block.model.getDefinition(propertyName);
            if (!definition) {
                // 2. Validate unknown property
                this.validateUnknownProperty(propertyName, property, diagnostics);
            } else {
                // 3. Validate property value
                this.validatePropertyValue(property, block.type, producerFakerJSEnabled, diagnostics);
            }
        }
    }

    private validateSyntaxProperty(propertyName: string | undefined, property: Property, diagnostics: Diagnostic[]) {
        // 1.1. property must contains ':' assigner
        const assigner = property.assignerCharacter;
        if (!assigner) {
            // Error => topic
            const range = property.propertyRange;
            diagnostics.push(new Diagnostic(range, `Missing ':' sign after '${propertyName}'`, DiagnosticSeverity.Error));
            return;
        }
        // 1.2. property must declare a key
        if (!propertyName) {
            // Error => :string
            const range = property.propertyRange;
            diagnostics.push(new Diagnostic(range, "Property must define a name before ':' sign", DiagnosticSeverity.Error));
            return;
        }
    }

    validateUnknownProperty(propertyName: string, property: Property, diagnostics: Diagnostic[]) {
        const range = property.propertyKeyRange;
        diagnostics.push(new Diagnostic(range, `Unkwown property '${propertyName}'`, DiagnosticSeverity.Warning));
    }

    async validatePropertyValue(property: Property, type: BlockType, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        const propertyName = property.propertyName;
        if (!propertyName) {
            return;
        }
        const propertyValue = property.propertyValue;
        const range = propertyValue ? property.propertyTrimmedValueRange : property.propertyKeyRange;
        if (!range) {
            return;
        }
        const errorMessage = await this.validateValue(propertyName, type, propertyValue);
        if (errorMessage) {
            diagnostics.push(new Diagnostic(range, errorMessage, DiagnosticSeverity.Error));
        }
        if (producerFakerJSEnabled) {
            const nodeValue = <DynamicChunk>property.value;
            if (nodeValue && nodeValue.expressions) {
                // Property like 'key' can declare Faker expressions, validate them.
                this.validateFakerJSExpressions(nodeValue, diagnostics);
            }
        }
    }

    private async validateValue(propertyName: string, type: BlockType, propertyValue?: string): Promise<string | undefined> {
        switch (propertyName) {
            case 'topic':
                return CommonsValidator.validateTopic(propertyValue);
            case 'key-format':
                return type === BlockType.consumer ? ConsumerValidator.validateKeyFormat(propertyValue) : ProducerValidator.validateKeyFormat(propertyValue);
            case 'value-format':
                return type === BlockType.consumer ? ConsumerValidator.validateValueFormat(propertyValue) : ProducerValidator.validateValueFormat(propertyValue);
            case 'from':
                return ConsumerValidator.validateOffset(propertyValue);
            case 'partitions': {
                return ConsumerValidator.validatePartitions(propertyValue);
            }
        }
    }

    async validateTopic(topicProperty: Property | undefined, blockType: BlockType, diagnostics: Diagnostic[]) {
        if (!topicProperty) {
            return;
        }
        const topicId = topicProperty.value?.content.trim();
        if (!topicId || topicId.length < 1) {
            return;
        }
        const { clusterId, clusterState } = this.selectedClusterProvider.getSelectedCluster();
        if (clusterId) {
            switch (clusterState) {
                case ClientState.connected: {
                    // The topic validation is done, only when the cluster is connected
                    if (!await this.topicProvider.getTopic(clusterId, topicId)) {
                        // The topic doesn't exist, report an error
                        const range = topicProperty.propertyTrimmedValueRange || topicProperty.propertyRange;
                        const autoCreate = await this.topicProvider.getAutoCreateTopicEnabled(clusterId);
                        const errorMessage = getTopicErrorMessage(topicId, autoCreate, blockType);
                        const severity = getTopicErrorSeverity(autoCreate);
                        diagnostics.push(new Diagnostic(range, errorMessage, severity));
                    }
                    break;
                }
                case ClientState.disconnected: {
                    // the cluster is disconnected, try to connect to the cluster, by trying retrieving the topic in async.
                    // if kafka client can be connected, it will process the validation again.
                    this.topicProvider.getTopic(clusterId, topicId);
                    break;
                }
            }
        }
    }
}

function getTopicErrorMessage(topicId: string, autoCreate: BrokerConfigs.AutoCreateTopicResult, blockType: BlockType): string {
    switch (autoCreate.type) {
        case "enabled":
            return `Unknown topic '${topicId}'. Topic will be created automatically.`;
        case "disabled":
            return `Unknown topic '${topicId}'. Cluster does not support automatic topic creation.`;
        default:
            return `Unknown topic '${topicId}'. Cluster might not support automatic topic creation.`;
    }
}

function getTopicErrorSeverity(autoCreate: BrokerConfigs.AutoCreateTopicResult): DiagnosticSeverity {
    switch (autoCreate.type) {
        case "enabled":
            return DiagnosticSeverity.Information;
        case "disabled":
            return DiagnosticSeverity.Error;
        default:
            return DiagnosticSeverity.Warning;
    }
}