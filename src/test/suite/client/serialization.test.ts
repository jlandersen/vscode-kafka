import * as assert from "assert";
import { deserialize } from "../../../client/serialization";

suite("Deserializer Test Suite", () => {

    test("Null data", () => {

        assert.deepStrictEqual(
            deserialize(null),
            null
        );
    });

    test("No deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([97, 98, 99, 100])),
            Buffer.from([97, 98, 99, 100])
        );
    });

    test("String deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([97, 98, 99, 100]), "string"),
            'abcd'
        );
    });

    test("Double deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([64, 94, 192, 0, 0, 0, 0, 0]), "double"),
            123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([64, 94, 221, 47, 26, 159, 190, 119]), "double"),
            123.456
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([192, 94, 192, 0, 0, 0, 0, 0]), "double"),
            -123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([0]), "double")?.message,
            'Size of data received by DoubleDeserializer is not 8'
        );

    });

    test("Float deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([66, 246, 0, 0]), "float"),
            123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([66, 246, 233, 121]), "float"),
            123.45600128173828
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([194, 246, 0, 0]), "float"),
            -123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([0]), "float")?.message,
            'Size of data received by FloatDeserializer is not 4'
        );

    });

    test("Integer deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 0, 0, 123]), "integer"),
            123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([255, 255, 255, 133]), "integer"),
            -123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([0]), "integer")?.message,
            'Size of data received by IntegerDeserializer is not 4'
        );

    });

    test("Long deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 0, 0, 0, 0, 0, 0, 123]), "long"),
            BigInt(123)
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([255, 255, 255, 255, 255, 255, 255, 133]), "long"),
            BigInt(-123)
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([0]), "long")?.message,
            'Size of data received by LongDeserializer is not 8'
        );

    });

    test("Short deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 123]), "short"),
            123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([255, 133]), "short"),
            -123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([0]), "short")?.message,
            'Size of data received by ShortDeserializer is not 2'
        );

    });

});
