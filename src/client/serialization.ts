export type MessageFormat = "none" | "double" | "float" | "integer" | "long" | "short";

export type SerializationdResult = any | Error;

class SerializationException extends Error { }

// ---------------- Deserializers ----------------

interface Deserializer {
    deserialize(data: Buffer): any;
}

const deserializerRegistry: Map<MessageFormat, Deserializer> = new Map();

export function deserialize(data: Buffer | null, format?: MessageFormat): SerializationdResult | null {
    if (data === null || !format || format === "none") {
        return null;
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
            throw new SerializationException("Size of data received by Deserializer is not 8");
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
            throw new SerializationException("Size of data received by Deserializer is not 4");
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
        return data.readUInt32BE(0);
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
        return data.readBigUInt64BE(0);
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
        return data.readUInt16BE(0);
    }
}

deserializerRegistry.set("double", new DoubleDeserializer());
deserializerRegistry.set("float", new FloatDeserializer());
deserializerRegistry.set("integer", new IntegerDeserializer());
deserializerRegistry.set("long", new LongDeserializer());
deserializerRegistry.set("short", new ShortDeserializer());
