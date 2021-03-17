export type MessageFormat = "none" | "string" | "double" | "float" | "integer" | "long" | "short" ;

export type SerializationdResult = any | Error;

export class SerializationException extends Error { }

// ---------------- Serializers ----------------

interface Serializer {
    serialize(data: string): Buffer | string | null;
}

const serializerRegistry: Map<MessageFormat, Serializer> = new Map();

export function serialize(data?: string, format?: MessageFormat): Buffer | string | null   {
    if (!data || !format) {
        return data || null;
    }
    const serializer = getSerializer(format);
    if (!serializer) {
        throw new SerializationException(`Cannot find a serializer for ${format} format.`);
    }
    return serializer.serialize(data);
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

    serialize(value: string): Buffer | string | null {
        return value;
    };
}

serializerRegistry.set("double", new DoubleSerializer());
serializerRegistry.set("float", new FloatSerializer());
serializerRegistry.set("integer", new IntegerSerializer());
serializerRegistry.set("long", new LongSerializer());
serializerRegistry.set("short", new ShortSerializer());
serializerRegistry.set("string", new StringSerializer());

// ---------------- Deserializers ----------------

interface Deserializer {
    deserialize(data: Buffer): any;
}

const deserializerRegistry: Map<MessageFormat, Deserializer> = new Map();

export function deserialize(data: Buffer | null, format?: MessageFormat): SerializationdResult | null {
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
        return deserializer.deserialize(data);
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

    deserialize(data: Buffer | null): any {
        if (data === null) {
            return null;
        }
        return data.toString();
    }
}

deserializerRegistry.set("double", new DoubleDeserializer());
deserializerRegistry.set("float", new FloatDeserializer());
deserializerRegistry.set("integer", new IntegerDeserializer());
deserializerRegistry.set("long", new LongDeserializer());
deserializerRegistry.set("short", new ShortDeserializer());
deserializerRegistry.set("string", new StringDeserializer());
