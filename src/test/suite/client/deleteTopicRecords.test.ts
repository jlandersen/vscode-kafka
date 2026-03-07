import * as assert from "assert";
import { PartitionOffset } from "../../../client/types";

// Note: We're testing the interface structure and type compatibility here
// The actual deleteTopicRecords function requires a live Kafka cluster

suite("Delete Topic Records Test Suite", () => {

    test("PartitionOffset should have partition and offset", () => {
        const entry: PartitionOffset = {
            partition: 0,
            offset: "100"
        };

        assert.strictEqual(entry.partition, 0);
        assert.strictEqual(entry.offset, "100");
    });

    test("PartitionOffset array for multiple partitions", () => {
        const partitions: PartitionOffset[] = [
            { partition: 0, offset: "100" },
            { partition: 1, offset: "200" },
            { partition: 2, offset: "300" }
        ];

        assert.strictEqual(partitions.length, 3);
        assert.strictEqual(partitions[0].partition, 0);
        assert.strictEqual(partitions[1].offset, "200");
    });

    test("PartitionOffset with high offset string", () => {
        const entry: PartitionOffset = {
            partition: 0,
            offset: "9999999999999"
        };

        assert.strictEqual(typeof entry.offset, "string");
        assert.ok(entry.offset.length > 0);
    });

    test("Empty partitions array", () => {
        const partitions: PartitionOffset[] = [];
        assert.strictEqual(partitions.length, 0);
    });

    test("PartitionOffset with partition number parsing", () => {
        const offsetData = {
            partition: "0",
            high: "500"
        };

        const entry: PartitionOffset = {
            partition: parseInt(offsetData.partition, 10),
            offset: offsetData.high
        };

        assert.strictEqual(typeof entry.partition, "number");
        assert.strictEqual(entry.partition, 0);
        assert.strictEqual(entry.offset, "500");
    });
});
