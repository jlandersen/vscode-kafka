import * as assert from "assert";
import { deserialize, serialize } from "../../../client/serialization";

suite("Serializer Test Suite", () => {

    test("Null data", () => {

        assert.deepStrictEqual(
            serialize(),
            null
        );
    });

    test("No serializer", () => {

        assert.deepStrictEqual(
            serialize('abcd'),
            'abcd'
        );
    });

    test("String serializer", () => {

        assert.deepStrictEqual(
            serialize('abcd', "string"),
            'abcd'
        );
    });

    test("Double serializer", () => {

        assert.deepStrictEqual(
            serialize('123', "double"),
            Buffer.from([64, 94, 192, 0, 0, 0, 0, 0])
        );

        assert.deepStrictEqual(
            serialize('123.456', "double"),
			Buffer.from([64, 94, 221, 47, 26, 159, 190, 119]),
        );

        assert.deepStrictEqual(
            serialize('-123', "double"),
            Buffer.from([192, 94, 192, 0, 0, 0, 0, 0])
        );

    });

    test("Float serializer", () => {

        assert.deepStrictEqual(
            serialize('123', "float"),
            Buffer.from([66, 246, 0, 0])
        );

        assert.deepStrictEqual(
            serialize('123.45600128173828', "float"),
            Buffer.from([66, 246, 233, 121])
        );

        assert.deepStrictEqual(
            serialize('-123', "float"),
            Buffer.from([194, 246, 0, 0])
        );

    });

    test("Integer serializer", () => {

        assert.deepStrictEqual(
            serialize('123', "integer"),
            Buffer.from([0, 0, 0, 123])
        );

        assert.deepStrictEqual(
            serialize('-123', "integer"),
            Buffer.from([255, 255, 255, 133])
        );

    });

    test("Long serializer", () => {

        assert.deepStrictEqual(
            serialize('123', "long"),
            Buffer.from([0, 0, 0, 0, 0, 0, 0, 123])
        );

        assert.deepStrictEqual(
            serialize('-123', "long"),
            Buffer.from([255, 255, 255, 255, 255, 255, 255, 133])
        );

    });

    test("Short serializer", () => {

        assert.deepStrictEqual(
            serialize('123', "short"),
            Buffer.from([0, 123])
        );

        assert.deepStrictEqual(
            serialize('-123', "short"),
            Buffer.from([255, 133])
        );

    });

});

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
