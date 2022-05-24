import { SerializationSetting } from "../../../client/serialization";
import { ProduceRecordCommand } from "../../../commands";
import { CalleeFunction, ProducerBlock } from "../parser/kafkaFileParser";
import { getSerializationSettings } from "./common";

export function createProduceRecordCommand(
    block: ProducerBlock,
    clusterId: string
): ProduceRecordCommand {
    let topicId;
    let key;
    let value = block.value?.content;
    let keyFormat;
    let keyFormatSettings: Array<SerializationSetting> | undefined;
    let valueFormat;
    let valueFormatSettings: Array<SerializationSetting> | undefined;
    let headers: Map<String, String> | undefined;
    block.properties.forEach((property) => {
        switch (property.propertyName) {
            case "topic":
                topicId = property.propertyValue;
                break;
            case "key":
                key = property.propertyValue;
                break;
            case "key-format": {
                const callee = <CalleeFunction>property.value;
                keyFormat = callee.functionName;
                keyFormatSettings = getSerializationSettings(callee);
                break;
            }
            case "value-format": {
                const callee = <CalleeFunction>property.value;
                valueFormat = callee.functionName;
                valueFormatSettings = getSerializationSettings(callee);
                break;
            }
            case "headers": {
                headers = parseHeaders(property.propertyValue);
                break;
            }
        }
    });
    return {
        clusterId,
        topicId,
        key,
        value,
        messageKeyFormat: keyFormat,
        messageKeyFormatSettings: keyFormatSettings,
        messageValueFormat: valueFormat,
        messageValueFormatSettings: valueFormatSettings,
        headers,
    } as ProduceRecordCommand;
}



function parseHeaders(propertyValue?: string): Map<string, string> | undefined {
    if (propertyValue) {
        const headers = propertyValue
            .split(",")
            .map((it) => it.trim().split("=", 2))
            .filter((it) => it.length === 2)
            .map((it) => [it[0].trim(), it[1].trim()] as [string, string]);

        return new Map(headers);
    }

    return undefined;
}
