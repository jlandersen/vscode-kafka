import * as assert from "assert";
import { deserialize } from "../../../client/serialization";

suite("Deserializer Test Suite", () => {

    test("Double deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([64, 94, 192, 0, 0, 0, 0, 0]), "double"),
            123
        );

        assert.deepStrictEqual(
            deserialize(Buffer.from([64, 94, 221, 47, 26, 159, 190, 119]), "double"),
            123.456
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
    });

    test("Integer deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 0, 0, 123]), "integer"),
            123
        );
    });

    test("Long deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 0, 0, 0, 0, 0, 0, 123]), "long"),
            BigInt(123)
        );
    });

    test("Short deserializer", () => {

        assert.deepStrictEqual(
            deserialize(Buffer.from([0, 123]), "short"),
            123
        );
    });

});
