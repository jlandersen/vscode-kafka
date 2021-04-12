import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from "vscode";
import { Block, BlockType, ConsumerBlock, KafkaFileDocument, ProducerBlock, Property } from "../parser/kafkaFileParser";
import { ConsumerValidator } from "../../../validators/consumer";
import { ProducerValidator } from "../../../validators/producer";
import { CommonsValidator } from "../../../validators/commons";

/**
 * Kafka file diagnostics support.
 */
export class KafkaFileDiagnostics {

    doDiagnostics(document: TextDocument, kafkaFileDocument: KafkaFileDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const block of kafkaFileDocument.blocks) {
            if (block.type === BlockType.consumer) {
                this.validateConsumerBlock(<ConsumerBlock>block, diagnostics);
            } else {
                this.validateProducerBlock(<ProducerBlock>block, diagnostics);
            }
        }
        return diagnostics;
    }

    validateConsumerBlock(block: ConsumerBlock, diagnostics: Diagnostic[]) {
        this.validateProperties(block, diagnostics);
    }

    validateProducerBlock(block: ProducerBlock, diagnostics: Diagnostic[]) {
        this.validateProperties(block, diagnostics);
        this.validateProducerValue(block, diagnostics);
    }
    validateProducerValue(block: ProducerBlock, diagnostics: Diagnostic[]) {
        const value = block.value;
        const errorMessage = ProducerValidator.validateProducerValue(value?.content);
        if (errorMessage) {
            const range = new Range(block.start, new Position(block.start.line, block.start.character + 8));
            diagnostics.push(new Diagnostic(range, errorMessage, DiagnosticSeverity.Error));
        }
    }

    validateProperties(block: Block, diagnostics: Diagnostic[]) {
        const existingProperties = new Map<string, Property[]>();
        let topicProperty: Property | undefined;
        for (const property of block.properties) {
            const propertyName = property.propertyName;
            this.validateProperty(property, block, diagnostics);
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
    validateProperty(property: Property, block: Block, diagnostics: Diagnostic[]) {
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
                this.validatePropertyValue(property, block.type, diagnostics);
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

    validatePropertyValue(property: Property, type: BlockType, diagnostics: Diagnostic[]) {
        const propertyName = property.propertyName;
        if (!propertyName) {
            return;
        }
        const propertyValue = property.propertyValue;
        const range = propertyValue ? property.propertyTrimmedValueRange : property.propertyKeyRange;
        if (!range) {
            return;
        }
        const errorMessage = this.validate(propertyName, type, propertyValue);
        if (errorMessage) {
            diagnostics.push(new Diagnostic(range, errorMessage, DiagnosticSeverity.Error));
        }
    }

    private validate(propertyName: string, type: BlockType, propertyValue?: string): string | undefined {
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
