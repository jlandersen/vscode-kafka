import * as avro from "avsc";
import * as fs from "fs";
import * as path from "path";
import * as protobuf from "protobufjs";
import { Uri } from "vscode";

export type MessageFormat = "none" | "string" | "json" | "avro" | "protobuf" | "double" | "float" | "integer" | "long" | "short";

export type SerializationResult = any | Error;

export class SerializationException extends Error { }

export interface SerializationSetting {
    name?: string;
    value?: string;
}

// ---------------- Serializers ----------------

interface Serializer {
    serialize(data: string, settings?: SerializationSetting[], baseFileUri?: Uri): Buffer | string | null;
}

const serializerRegistry: Map<MessageFormat, Serializer> = new Map();

export function serialize(data?: string, format?: MessageFormat, settings?: SerializationSetting[], baseFileUri?: Uri): Buffer | string | null {
    if (!data || !format) {
        return data || null;
    }
    const serializer = getSerializer(format);
    if (!serializer) {
        throw new SerializationException(`Cannot find a serializer for ${format} format.`);
    }
    return serializer.serialize(data, settings, baseFileUri);
}

function getSerializer(format: MessageFormat): Serializer | undefined {
    return serializerRegistry.get(format);
}

class DoubleSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        const data = parseFloat(value);
        const result = Buffer.alloc(8);
        result.writeDoubleBE(data, 0);
        return result;
    };
}

class FloatSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        const data = parseFloat(value);
        const result = Buffer.alloc(4);
        result.writeFloatBE(data, 0);
        return result;
    };
}

class IntegerSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        const data = parseInt(value);
        const result = Buffer.alloc(4);
        result.writeInt32BE(data, 0);
        return result;
    };
}

class LongSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        const data = parseInt(value);
        const result = Buffer.alloc(8);
        result.writeBigInt64BE(BigInt(data), 0);
        return result;
    };
}

class ShortSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        const data = parseInt(value);
        const result = Buffer.alloc(2);
        result.writeInt16BE(data, 0);
        return result;
    };
}

class StringSerializer implements Serializer {

    serialize(value: string, settings?: SerializationSetting[]): Buffer | string | null {
        const encoding = settings?.[0].value;
        if (encoding) {
            return Buffer.from(value, <BufferEncoding>encoding);
        }
        return value;
    };
}

class JsonSerializer implements Serializer {

    serialize(value: string): Buffer | string | null {
        JSON.parse(value);
        return value;
    };
}

class AvroSerializer implements Serializer {

    serialize(value: string, settings?: SerializationSetting[], baseFileUri?: Uri): Buffer | string | null {
        const schema = resolveAvroSchema(settings, baseFileUri);
        const data = JSON.parse(value);
        const avroType = avro.Type.forSchema(schema);
        return avroType.toBuffer(data);
    }
}

class ProtobufSerializer implements Serializer {

    serialize(value: string, settings?: SerializationSetting[], baseFileUri?: Uri): Buffer | string | null {
        const protobufType = resolveProtobufType(settings, baseFileUri);
        const data = JSON.parse(value);
        const validationError = protobufType.verify(data);
        if (validationError) {
            throw new SerializationException(`Invalid protobuf payload: ${validationError}`);
        }
        const message = protobufType.create(data);
        return Buffer.from(protobufType.encode(message).finish());
    }
}

serializerRegistry.set("double", new DoubleSerializer());
serializerRegistry.set("float", new FloatSerializer());
serializerRegistry.set("integer", new IntegerSerializer());
serializerRegistry.set("long", new LongSerializer());
serializerRegistry.set("short", new ShortSerializer());
serializerRegistry.set("string", new StringSerializer());
serializerRegistry.set("json", new JsonSerializer());
serializerRegistry.set("avro", new AvroSerializer());
serializerRegistry.set("protobuf", new ProtobufSerializer());

// ---------------- Deserializers ----------------

interface Deserializer {
    deserialize(data: Buffer, settings?: SerializationSetting[], baseFileUri?: Uri): any;
}

const deserializerRegistry: Map<MessageFormat, Deserializer> = new Map();

export function deserialize(data: Buffer | null, format?: MessageFormat, settings?: SerializationSetting[], baseFileUri?: Uri): SerializationResult | null {
    if (data === null || !format) {
        return data;
    }
    if (format === "none") {
        return '';
    }
    try {
        const deserializer = getDeserializer(format);
        if (!deserializer) {
            throw new SerializationException(`Cannot find a deserializer for ${format} format.`);
        }
        return deserializer.deserialize(data, settings, baseFileUri);
    }
    catch (e) {
        return e;
    }
}

function getDeserializer(format: MessageFormat): Deserializer | undefined {
    return deserializerRegistry.get(format);
}

class DoubleDeserializer implements Deserializer {

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        if (data.length !== 8) {
            throw new SerializationException("Size of data received by DoubleDeserializer is not 8");
        }
        return data.readDoubleBE(0);
    }
}

class FloatDeserializer implements Deserializer {

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        if (data.length !== 4) {
            throw new SerializationException("Size of data received by FloatDeserializer is not 4");
        }
        return data.readFloatBE(0);
    }
}

class IntegerDeserializer implements Deserializer {

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        if (data.length !== 4) {
            throw new Error("Size of data received by IntegerDeserializer is not 4");
        }
        return data.readInt32BE(0);
    }
}

class LongDeserializer implements Deserializer {

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        if (data.length !== 8) {
            throw new SerializationException("Size of data received by LongDeserializer is not 8");
        }
        return data.readBigInt64BE(0);
    }
}

class ShortDeserializer implements Deserializer {

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        if (data.length !== 2) {
            throw new SerializationException("Size of data received by ShortDeserializer is not 2");
        }
        return data.readInt16BE(0);
    }
}

class StringDeserializer implements Deserializer {

    deserialize(data: Buffer | null, settings?: SerializationSetting[]): any {
        if (data === null) {
            return null;
        }
        const encoding = settings?.[0].value as BufferEncoding | undefined;
        return data.toString(encoding);
    }
}

class JsonDeserializer implements Deserializer {

    deserialize(data: Buffer | null, settings?: SerializationSetting[]): any {
        if (data === null) {
            return null;
        }
        const encoding = settings?.[0].value as BufferEncoding | undefined;
        return data.toString(encoding);
    }
}

class AvroDeserializer implements Deserializer {

    deserialize(data: Buffer | null, settings?: SerializationSetting[], baseFileUri?: Uri): any {
        if (data === null) {
            return null;
        }
        const schema = resolveAvroSchema(settings, baseFileUri);
        const avroType = avro.Type.forSchema(schema);
        return avroType.fromBuffer(data);
    }
}

class ProtobufDeserializer implements Deserializer {

    deserialize(data: Buffer | null, settings?: SerializationSetting[], baseFileUri?: Uri): any {
        if (data === null) {
            return null;
        }
        const protobufType = resolveProtobufType(settings, baseFileUri);
        const message = protobufType.decode(data);
        return protobufType.toObject(message, {
            longs: String,
            enums: String,
            bytes: String
        });
    }
}

deserializerRegistry.set("double", new DoubleDeserializer());
deserializerRegistry.set("float", new FloatDeserializer());
deserializerRegistry.set("integer", new IntegerDeserializer());
deserializerRegistry.set("long", new LongDeserializer());
deserializerRegistry.set("short", new ShortDeserializer());
deserializerRegistry.set("string", new StringDeserializer());
deserializerRegistry.set("json", new JsonDeserializer());
deserializerRegistry.set("avro", new AvroDeserializer());
deserializerRegistry.set("protobuf", new ProtobufDeserializer());

function getAvroSchemaSetting(settings?: SerializationSetting[]): string | undefined {
    return getNamedOrFirstUnnamedSetting(settings, "value-schema");
}

function getProtobufTypeSetting(settings?: SerializationSetting[]): string | undefined {
    const namedSetting = settings?.find(setting => setting.name === "value-type" || setting.name === "value-message-type");
    if (namedSetting?.value) {
        return namedSetting.value;
    }
    return getUnnamedSettings(settings)[0]?.value;
}

function getProtobufSchemaSetting(settings?: SerializationSetting[]): string | undefined {
    const namedSetting = settings?.find(setting => setting.name === "value-schema");
    if (namedSetting?.value) {
        return namedSetting.value;
    }
    const unnamedSettings = getUnnamedSettings(settings);
    if (unnamedSettings.length > 1) {
        return unnamedSettings[1].value;
    }
    if (unnamedSettings.length === 1 && !getProtobufTypeSetting(settings)) {
        return unnamedSettings[0].value;
    }
}

function getNamedOrFirstUnnamedSetting(settings: SerializationSetting[] | undefined, settingName: string): string | undefined {
    const namedSetting = settings?.find(setting => setting.name === settingName);
    if (namedSetting?.value) {
        return namedSetting.value;
    }
    return getUnnamedSettings(settings)[0]?.value;
}

function getUnnamedSettings(settings?: SerializationSetting[]): SerializationSetting[] {
    if (!settings) {
        return [];
    }
    return settings.filter(setting => !setting.name && !!setting.value);
}

function resolveAvroSchema(settings?: SerializationSetting[], baseFileUri?: Uri): avro.Schema {
    const schemaSetting = getAvroSchemaSetting(settings);
    if (!schemaSetting) {
        throw new SerializationException("The value-schema is required for avro serialization.");
    }

    const schemaContent = resolveSchemaContent(schemaSetting, baseFileUri);
    return JSON.parse(schemaContent) as avro.Schema;
}

function resolveProtobufType(settings?: SerializationSetting[], baseFileUri?: Uri): protobuf.Type {
    const schemaSetting = getProtobufSchemaSetting(settings);
    if (!schemaSetting) {
        throw new SerializationException("The value-schema is required for protobuf serialization.");
    }
    const messageTypeSetting = getProtobufTypeSetting(settings);
    if (!messageTypeSetting) {
        throw new SerializationException("The protobuf message type is required. Use value-format: protobuf(fully.qualified.Message).");
    }
    const schemaFileReference = parseSchemaFileReference(schemaSetting);
    if (!schemaFileReference) {
        throw new SerializationException("The protobuf value-schema must be a file reference like file(./schemas/event.proto).");
    }
    const root = protobuf.loadSync(resolveSchemaFilePath(schemaFileReference, baseFileUri));
    return root.lookupType(messageTypeSetting.trim());
}

function resolveSchemaContent(schemaSetting: string, baseFileUri?: Uri): string {
    const fileReference = parseSchemaFileReference(schemaSetting);
    if (!fileReference) {
        return schemaSetting;
    }
    const schemaPath = resolveSchemaFilePath(fileReference, baseFileUri);
    return fs.readFileSync(schemaPath, { encoding: "utf8" });
}

function parseSchemaFileReference(schemaContent: string): string | undefined {
    const match = /^file\((.*)\)$/.exec(schemaContent.trim());
    if (!match) {
        return;
    }
    const rawPath = match[1].trim();
    if ((rawPath.startsWith('"') && rawPath.endsWith('"')) || (rawPath.startsWith("'") && rawPath.endsWith("'"))) {
        return rawPath.slice(1, -1);
    }
    return rawPath;
}

function resolveSchemaFilePath(schemaPath: string, baseFileUri?: Uri): string {
    if (path.isAbsolute(schemaPath)) {
        return schemaPath;
    }
    if (baseFileUri?.scheme === "file") {
        return path.resolve(path.dirname(baseFileUri.fsPath), schemaPath);
    }
    return path.resolve(process.cwd(), schemaPath);
}
