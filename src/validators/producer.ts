import { ProduceRecordCommand } from "../commands";
import { producerModel } from "../kafka-file/languageservice/model";
import { CommonsValidator } from "./commons";

export namespace ProducerValidator {

    export function validate(command: ProduceRecordCommand) {
        let errorMessage =
            CommonsValidator.validateTopic(command.topicId) ||
            validateProducerValue(command.value) ||
            validateKeyFormat(command.messageKeyFormat) ||
            validateValueFormat(command.messageValueFormat);
        if (errorMessage) {
            throw new Error(errorMessage);
        }
    }

    export function validateProducerValue(value?: string): string | undefined {
        if (!value) {
            return 'The producer value is required.';
        }
    }

    export function validateKeyFormat(propertyValue?: string): string | undefined {
        if (!propertyValue) {
            return;
        }
        if (!producerModel.hasDefinitionEnum('key-format', propertyValue)) {
            return `Invalid key format for '${propertyValue}'`;
        }
    }

    export function validateValueFormat(propertyValue?: string): string | undefined {
        if (!propertyValue) {
            return;
        }
        if (!producerModel.hasDefinitionEnum('value-format', propertyValue)) {
            return `Invalid value format for '${propertyValue}'`;
        }
    }
}
