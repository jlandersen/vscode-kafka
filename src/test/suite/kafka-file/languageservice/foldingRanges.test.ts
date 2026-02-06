import { FoldingRangeKind } from "vscode";
import { assertFoldingRanges, foldingRange, getSimpleLanguageService } from "./kafkaAssert";

const languageService = getSimpleLanguageService();

suite("Kafka File Folding Ranges Test Suite", () => {
    test("Empty folding ranges", async () => {
        await assertFoldingRanges(
            ``,
            [],
            languageService);
    });
});

suite("Kafka File PRODUCER Folding Ranges Test Suite", () => {
    test("Single line PRODUCER (no fold)", async () => {
        await assertFoldingRanges(
            `PRODUCER`,
            [],
            languageService);
    });

    test("Multi-line PRODUCER fold", async () => {
        await assertFoldingRanges(
            `PRODUCER
topic: my-topic`,
            [
                foldingRange(0, 1, FoldingRangeKind.Region)
            ],
            languageService);
    });

    test("PRODUCER with value fold", async () => {
        await assertFoldingRanges(
            `PRODUCER
topic: my-topic
key: my-key
{"message": "hello"}`,
            [
                foldingRange(0, 3, FoldingRangeKind.Region)
            ],
            languageService);
    });

    test("Two PRODUCER blocks fold", async () => {
        await assertFoldingRanges(
            `PRODUCER
topic: topic1
key: key1

###

PRODUCER
topic: topic2
key: key2`,
            [
                foldingRange(0, 3, FoldingRangeKind.Region),
                foldingRange(6, 8, FoldingRangeKind.Region)
            ],
            languageService);
    });
});

suite("Kafka File CONSUMER Folding Ranges Test Suite", () => {
    test("Single line CONSUMER (no fold)", async () => {
        await assertFoldingRanges(
            `CONSUMER group-id`,
            [],
            languageService);
    });

    test("Multi-line CONSUMER fold", async () => {
        await assertFoldingRanges(
            `CONSUMER group-id
topic: my-topic`,
            [
                foldingRange(0, 1, FoldingRangeKind.Region)
            ],
            languageService);
    });

    test("CONSUMER with multiple properties fold", async () => {
        await assertFoldingRanges(
            `CONSUMER group-id
topic: my-topic
from: earliest
partitions: 0,1,2`,
            [
                foldingRange(0, 3, FoldingRangeKind.Region)
            ],
            languageService);
    });

    test("Two CONSUMER blocks fold (no separator)", async () => {
        await assertFoldingRanges(
            `CONSUMER group-1
topic: topic1

CONSUMER group-2
topic: topic2`,
            [
                foldingRange(0, 2, FoldingRangeKind.Region),
                foldingRange(3, 4, FoldingRangeKind.Region)
            ],
            languageService);
    });
});

suite("Kafka File Mixed Blocks Folding Ranges Test Suite", () => {
    test("PRODUCER and CONSUMER fold", async () => {
        await assertFoldingRanges(
            `PRODUCER
topic: topic1
key: key1
{"value": "test"}

###

CONSUMER group-id
topic: topic2
from: latest`,
            [
                foldingRange(0, 4, FoldingRangeKind.Region),
                foldingRange(7, 9, FoldingRangeKind.Region)
            ],
            languageService);
    });
});
