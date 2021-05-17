import { assertDocumentLinks, documentLink, position } from "./kafkaAssert";

suite("Kafka File No Document Links Test Suite", () => {

    test("Empty document links", async () => {
        await assertDocumentLinks('', []);
    });

});

suite("Kafka File PRODUCER Avro Document Links Test Suite", () => {

    test("PRODUCER Avro Document Links (in key-format)", async () => {
        await assertDocumentLinks(
            'PRODUCER a\n' +
            'key-format: avro(animals.avsc)',
            [
                documentLink(
                    position(1, 17),
                    position(1, 29),
                    'animals.avsc'
                )
            ]);
    });

    test("PRODUCER Avro Document Links (in value-format)", async () => {
        await assertDocumentLinks(
            'PRODUCER a\n' +
            'value-format: avro(animals.avsc)',
            [
                documentLink(
                    position(1, 19),
                    position(1, 31),
                    'animals.avsc'
                )
            ]);
    });

    test("PRODUCER Avro Document Links (in key-format & value-format)", async () => {
        await assertDocumentLinks(
            'PRODUCER a\n' +
            'key-format: avro(abcdefg.avsc)\n' +
            'value-format: avro(animals.avsc)',
            [
                documentLink(
                    position(1, 17),
                    position(1, 29),
                    'abcdefg.avsc'
                ),
                documentLink(
                    position(2, 19),
                    position(2, 31),
                    'animals.avsc'
                )
            ]);
    });

});