import { parsePartitions } from "../client";
import { LaunchConsumerCommand } from "../commands";
import { consumerModel } from "../kafka-file/languageservice/model";
import { CommonsValidator } from "./commons";

export namespace ConsumerValidator {

    export function validate(command: LaunchConsumerCommand) {
        let errorMessage =
            CommonsValidator.validateTopic(command.topicId) ||
            validateOffset(command.fromOffset) ||
            validatePartitions(command.partitions) ||
            validateKeyFormat(command.messageKeyFormat) ||
            validateValueFormat(command.messageValueFormat);
        if (errorMessage) {
            throw new Error(errorMessage);
        }
    }

    export function validateOffset(offset?: string): string | undefined {
        if (!offset || offset === 'earliest' || offset === 'latest') {
            return;
        }
        const valueAsNumber = parseInt(offset, 10);
        if (isNaN(valueAsNumber) || valueAsNumber < 0) {
            return "from must be a positive number or equal to 'earliest' or 'latest'.";
        }
    }

    export function validatePartitions(partitions?: string): string | undefined {
        if (!partitions) {
            return;
        }
        try {
            parsePartitions(partitions);
        }
        catch (e) {
            return e.message;
        }
    }

    export function validateKeyFormat(propertyValue?: string): string | undefined {
        if (!propertyValue) {
            return;
        }
        if (!consumerModel.hasDefinitionEnum('key-format', propertyValue)) {
            return `Invalid key format for '${propertyValue}'`;
        }
    }

    export function validateValueFormat(propertyValue?: string): string | undefined {
        if (!propertyValue) {
            return;
        }
        if (!consumerModel.hasDefinitionEnum('value-format', propertyValue)) {
            return `Invalid value format for '${propertyValue}'`;
        }
    }
}
