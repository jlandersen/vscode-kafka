import { Uri } from "vscode";

const serializerRegistry: Map<MessageFormat, Serializer> = new Map();

export type MessageFormat = "none" | "string" | "double" | "float" | "integer" | "long" | "short" | string;

export type SerializationdResult = any | Error;

export class SerializationException extends Error { }

export interface SerializationSetting {
    name?: string;
    value?: string;
}

// ---------------- Serializers ----------------

export interface Serializer {
    serialize(data: string, baseFileUri?: Uri, settings?: SerializationSetting[]): Buffer | string | null;
}

export function registerSerializer(serializerId: string, serializer: Serializer) {
    serializerRegistry.set(serializerId, serializer);
}

export function serialize(data?: string, format?: MessageFormat, baseFileUri?: Uri, settings?: SerializationSetting[]): Buffer | string | null {
    if (!data || !format) {
        return data || null;
    }
    const serializer = getSerializer(format);
    if (!serializer) {
        throw new SerializationException(`Cannot find a serializer for ${format} format.`);
    }
    return serializer.serialize(data, baseFileUri, settings);
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

    serialize(value: string, baseFileUri: Uri | undefined, settings?: SerializationSetting[]): Buffer | string | null {
        const encoding = settings?.[0].value;
        if (encoding) {
            return Buffer.from(value, <BufferEncoding>encoding);
        }
        return value;
    };
}

// Register default Kafka serializers
registerSerializer("double", new DoubleSerializer());
registerSerializer("float", new FloatSerializer());
registerSerializer("integer", new IntegerSerializer());
registerSerializer("long", new LongSerializer());
registerSerializer("short", new ShortSerializer());
registerSerializer("string", new StringSerializer());

// ---------------- Deserializers ----------------
const deserializerRegistry: Map<MessageFormat, Deserializer> = new Map();

export interface Deserializer {
    deserialize(data: Buffer, baseFileUri?: Uri, settings?: SerializationSetting[]): any;
}

export function registerDeserializer(deserializerId: string, deserializer: Deserializer) {
    deserializerRegistry.set(deserializerId, deserializer);
}

export function deserialize(data: Buffer | null, format?: MessageFormat, baseFileUri?: Uri, settings?: SerializationSetting[]): SerializationdResult | null {
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
        return deserializer.deserialize(data, baseFileUri, settings);
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

    deserialize(data: Buffer | null, baseFileUri: Uri | undefined, settings?: SerializationSetting[]): any {
        if (data === null) {
            return null;
        }
        const encoding = settings?.[0].value;
        return data.toString(encoding);
    }
}

// Register default Kafka deserializers
registerDeserializer("double", new DoubleDeserializer());
registerDeserializer("float", new FloatDeserializer());
registerDeserializer("integer", new IntegerDeserializer());
registerDeserializer("long", new LongDeserializer());
registerDeserializer("short", new ShortDeserializer());
registerDeserializer("string", new StringDeserializer());
