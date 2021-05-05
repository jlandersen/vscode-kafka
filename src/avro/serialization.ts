import { Uri } from "vscode";
import { Deserializer, registerDeserializer, registerSerializer, SerializationException, SerializationSetting, Serializer } from "../client/serialization";
import { readAVSC } from "./avroFileSupport";

const avroType = "avro";

export function registerAvroSerialization() {
    registerSerializer(avroType, new AvroSerializer());
    registerDeserializer(avroType, new AvroDeserializer());
}

class AvroSerializer implements Serializer {

    serialize(value: string, baseFileUri: Uri | undefined, settings: SerializationSetting[]): Buffer | string | null {
        const path = getAvroSchemaPath(settings);
        const data = JSON.parse(value);
        const avroType = readAVSC(baseFileUri, path);
        return avroType.toBuffer(data);
    }
}

class AvroDeserializer implements Deserializer {

    deserialize(data: Buffer | null, baseFileUri: Uri | undefined, settings?: SerializationSetting[]): any {
        if (data === null) {
            return null;
        }
        const path = getAvroSchemaPath(settings);
        const avroType = readAVSC(baseFileUri, path);
        return avroType.fromBuffer(data);
    }
}

function getAvroSchemaPath(settings?: SerializationSetting[]): string {
    const path = settings ? settings[0].value : undefined;
    if (!path) {
        throw new SerializationException("The avro file path is required");
    }
    return path;
}