export type MessageFormat = "none" | "string" | "double" | "float" | "integer" | "long" | "short" ;

export type SerializationdResult = any | Error;

export class SerializationException extends Error { }

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
