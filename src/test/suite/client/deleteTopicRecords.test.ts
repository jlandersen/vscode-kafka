import * as assert from "assert";
import { SeekEntry } from "kafkajs";

// Note: We're testing the interface structure and type compatibility here
// The actual deleteTopicRecords function requires a live Kafka cluster

suite("Delete Topic Records Test Suite", () => {

    test("SeekEntry should have partition and offset", () => {
        const seekEntry: SeekEntry = {
            partition: 0,
            offset: "100"
        };

        assert.strictEqual(seekEntry.partition, 0);
        assert.strictEqual(seekEntry.offset, "100");
    });

    test("SeekEntry array for multiple partitions", () => {
        const partitions: SeekEntry[] = [
            { partition: 0, offset: "100" },
            { partition: 1, offset: "200" },
            { partition: 2, offset: "300" }
        ];

        assert.strictEqual(partitions.length, 3);
        assert.strictEqual(partitions[0].partition, 0);
        assert.strictEqual(partitions[1].offset, "200");
    });

    test("SeekEntry with high offset string", () => {
        const seekEntry: SeekEntry = {
            partition: 0,
            offset: "9999999999999"
        };

        assert.strictEqual(typeof seekEntry.offset, "string");
        assert.ok(seekEntry.offset.length > 0);
    });

    test("Empty partitions array", () => {
        const partitions: SeekEntry[] = [];
        assert.strictEqual(partitions.length, 0);
    });

    test("SeekEntry with partition number parsing", () => {
        const offsetData = {
            partition: "0",
            high: "500"
        };

        const seekEntry: SeekEntry = {
            partition: parseInt(offsetData.partition, 10),
            offset: offsetData.high
        };

        assert.strictEqual(typeof seekEntry.partition, "number");
        assert.strictEqual(seekEntry.partition, 0);
        assert.strictEqual(seekEntry.offset, "500");
    });
});
