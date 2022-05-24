import { LaunchConsumerCommand } from "../../../commands/consumers";
import { CalleeFunction, ConsumerBlock } from "../parser/kafkaFileParser";
import { getSerializationSettings } from "./common";


export function createLaunchConsumerCommand(block: ConsumerBlock, selectedClusterId: string | undefined): LaunchConsumerCommand {
    let consumerGroupId = block.consumerGroupId?.content;
    let topicId;
    let partitions;
    let offset;
    let keyFormat;
    let keyFormatSettings;
    let valueFormat;
    let valueFormatSettings;
    block.properties.forEach(property => {
        switch (property.propertyName) {
            case 'topic':
                topicId = property.propertyValue;
                break;
            case 'from':
                offset = property.propertyValue;
                break;
            case 'partitions':
                partitions = property.propertyValue;
                break;
            case 'key-format': {
                const callee = <CalleeFunction>property.value;
                keyFormat = callee.functionName;
                keyFormatSettings = getSerializationSettings(callee);
                break;
            }
            case 'value-format': {
                const callee = <CalleeFunction>property.value;
                valueFormat = callee.functionName;
                valueFormatSettings = getSerializationSettings(callee);
                break;
            }
        }
    });

    return {
        clusterId: selectedClusterId,
        consumerGroupId,
        topicId: topicId || '',
        fromOffset: offset,
        partitions,
        messageKeyFormat: keyFormat,
        messageValueFormat: valueFormat,
        messageKeyFormatSettings: keyFormatSettings,
        messageValueFormatSettings: valueFormatSettings
    } as LaunchConsumerCommand;
}