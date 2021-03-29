import { BlockType } from "../../../../kafka-file/languageservice/parser/kafkaFileParser";
import { assertParseBlock, block, position } from "./kafkaAssert";

suite("Kafka File Parser Test Suite", () => {

    test("Empty blocks", async () => {
        await assertParseBlock('', []);
        await assertParseBlock('   ', []);
        await assertParseBlock('a\nb', []);
        await assertParseBlock('abcd', []);
    });

});

suite("Kafka File Parser PRODUCER Test Suite", () => {

    test("One PRODUCER parsing", async () => {
        await assertParseBlock('PRODUCER p1', [
            block(BlockType.producer, position(0, 0), position(0, 11))
        ]);

        await assertParseBlock(
            'PRODUCER p1\n' +
            'PRODUCER p2', [
            block(BlockType.producer, position(0, 0), position(1, 11),
                [],
                {
                    content: 'PRODUCER p2',
                    start: position(1, 0),
                    end: position(2, 0)
                }
            )
        ]);
    });

    test("Two PRODUCER parsing", async () => {
        await assertParseBlock(
            'PRODUCER p1\n' +
            '###\n' +
            'PRODUCER p2', [
            block(BlockType.producer, position(0, 0), position(0, 11)),
            block(BlockType.producer, position(2, 0), position(2, 11))
        ]);
    });

    test("Two PRODUCER parsing", async () => {
        await assertParseBlock(
            'PRODUCER p1\n' +
            '###        XXXXXXXXXXXXXXXXX\n' +
            'PRODUCER p2', [
            block(BlockType.producer, position(0, 0), position(0, 11)),
            block(BlockType.producer, position(2, 0), position(2, 11))
        ]);
    });

    test("PRODUCER with properties parsing", async () => {
        await assertParseBlock(
            'PRODUCER p1\n' +
            'topic:abcd\n' +
            'ABCD\n' +
            'EFGH', [
            block(BlockType.producer, position(0, 0), position(3, 4),
                [
                    {
                        propertyName: 'topic',
                        key: {
                            content: 'topic',
                            start: position(1, 0),
                            end: position(1, 5)
                        },
                        value: {
                            content: 'abcd',
                            start: position(1, 6),
                            end: position(1, 10)
                        }
                    }
                ]
                , {
                    content: 'ABCD\nEFGH',
                    start: position(2, 0),
                    end: position(4, 0)
                }
            )
        ]);
    });
});

suite("Kafka File Parser CONSUMER Test Suite", () => {

    test("One CONSUMER parsing", async () => {
        await assertParseBlock('CONSUMER c1', [
            block(BlockType.consumer, position(0, 0), position(0, 11))
        ]);
    });

    test("Two CONSUMER parsing", async () => {
        await assertParseBlock(
            'CONSUMER c1\n' +
            'CONSUMER c2', [
            block(BlockType.consumer, position(0, 0), position(0, 11)),
            block(BlockType.consumer, position(1, 0), position(1, 11))
        ]);
    });

    test("CONSUMER with properties parsing", async () => {
        await assertParseBlock(
            'CONSUMER c1\n' +
            'topic:abcd', [
            block(BlockType.consumer, position(0, 0), position(1, 10),
                [
                    {
                        propertyName: 'topic',
                        key: {
                            content: 'topic',
                            start: position(1, 0),
                            end: position(1, 5)
                        },
                        value: {
                            content: 'abcd',
                            start: position(1, 6),
                            end: position(1, 10)
                        }
                    }
                ])
        ]);
    });

});
