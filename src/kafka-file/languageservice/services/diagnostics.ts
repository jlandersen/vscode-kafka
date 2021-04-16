import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from "vscode";
import { Block, BlockType, ConsumerBlock, DynamicChunk, KafkaFileDocument, ProducerBlock, Property } from "../parser/kafkaFileParser";
import { ConsumerValidator } from "../../../validators/consumer";
import { ProducerValidator } from "../../../validators/producer";
import { CommonsValidator } from "../../../validators/commons";
import { fakerjsAPIModel, PartModelProvider } from "../model";

/**
 * Kafka file diagnostics support.
 */
export class KafkaFileDiagnostics {

    doDiagnostics(document: TextDocument, kafkaFileDocument: KafkaFileDocument, producerFakerJSEnabled: boolean): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const block of kafkaFileDocument.blocks) {
            if (block.type === BlockType.consumer) {
                this.validateConsumerBlock(<ConsumerBlock>block, diagnostics);
            } else {
                this.validateProducerBlock(<ProducerBlock>block, producerFakerJSEnabled, diagnostics);
            }
        }
        return diagnostics;
    }

    validateConsumerBlock(block: ConsumerBlock, diagnostics: Diagnostic[]) {
        this.validateProperties(block, false, diagnostics);
    }

    validateProducerBlock(block: ProducerBlock, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        this.validateProperties(block, producerFakerJSEnabled, diagnostics);
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
                    const expressionRange = expression.enclosedExpressionRange;
                    const start = new Position(expressionRange.start.line, expressionRange.start.character + offset);
                    const end = new Position(expressionRange.end.line, start.character + part.length);
                    const range = new Range(start, end);
                    diagnostics.push(new Diagnostic(range, `Invalid ${i === 0 ? 'module' : 'method'}: '${part}'`, DiagnosticSeverity.Error));
                    break;
                }
                offset += part.length;
                parentPartModel = partModel;
            }
        });
    }
    validateProperties(block: Block, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
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

    validatePropertyValue(property: Property, type: BlockType, producerFakerJSEnabled: boolean, diagnostics: Diagnostic[]) {
        const propertyName = property.propertyName;
        if (!propertyName) {
            return;
        }
        const propertyValue = property.propertyValue;
        const range = propertyValue ? property.propertyTrimmedValueRange : property.propertyKeyRange;
        if (!range) {
            return;
        }
        const errorMessage = this.validateValue(propertyName, type, propertyValue);
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

    private validateValue(propertyName: string, type: BlockType, propertyValue?: string): string | undefined {
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
}
