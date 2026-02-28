import * as assert from "assert";
import { ConsumedRecord } from "../../../client";
import { ConsumerSession } from "../../../providers/consumerSession";

suite("ConsumerSession Test Suite", () => {

    function createRecord(index: number, value = `value-${index}`): ConsumedRecord {
        return {
            topic: "orders",
            partition: 0,
            offset: String(index),
            key: `key-${index}`,
            value,
            headers: {
                source: "test"
            },
            timestamp: String(1700000000000 + index)
        };
    }

    test("evicts oldest messages when max buffer is reached", () => {
        const session = new ConsumerSession(3);

        session.addRecord(createRecord(1));
        session.addRecord(createRecord(2));
        session.addRecord(createRecord(3));
        session.addRecord(createRecord(4));

        const counts = session.getCounts();
        assert.strictEqual(counts.total, 3);

        const page = session.getMessages();
        assert.strictEqual(page.messages.length, 3);
        assert.strictEqual(page.messages[0].offset, "4");
        assert.strictEqual(page.messages[1].offset, "3");
        assert.strictEqual(page.messages[2].offset, "2");
    });

    test("applies search filter without clearing buffered messages", () => {
        const session = new ConsumerSession(10);

        session.addRecord(createRecord(1, "order-created"));
        session.addRecord(createRecord(2, "payment-received"));
        session.addRecord(createRecord(3, "order-shipped"));

        session.setSearchQuery("order");

        const counts = session.getCounts();
        assert.strictEqual(counts.total, 3);
        assert.strictEqual(counts.filtered, 2);

        const page = session.getMessages();
        assert.strictEqual(page.messages.length, 2);
        assert.strictEqual(page.messages[0].value, "order-shipped");
        assert.strictEqual(page.messages[1].value, "order-created");
    });

    test("supports running paused and error stream states", () => {
        const session = new ConsumerSession(10);

        assert.strictEqual(session.getState().streamState, "running");

        session.pause();
        assert.strictEqual(session.getState().streamState, "paused");

        session.resume();
        assert.strictEqual(session.getState().streamState, "running");

        session.setError(new Error("consumer failed"));
        const state = session.getState();
        assert.strictEqual(state.streamState, "error");
        assert.strictEqual(state.error, "consumer failed");
    });

    test("updates pagination and counts deterministically", () => {
        const session = new ConsumerSession(20);

        for (let i = 1; i <= 8; i++) {
            session.addRecord(createRecord(i));
        }

        session.setPagination(2, 3);

        const page = session.getMessages();
        assert.strictEqual(page.page, 2);
        assert.strictEqual(page.pageSize, 3);
        assert.strictEqual(page.totalPages, 3);
        assert.deepStrictEqual(page.messages.map((message) => message.offset), ["5", "4", "3"]);

        const state = session.getState();
        assert.strictEqual(state.totalMessages, 8);
        assert.strictEqual(state.filteredMessages, 8);
        assert.strictEqual(state.totalPages, 3);
    });

    test("applies partition filter on top of search filters", () => {
        const session = new ConsumerSession(20);

        session.addRecord(createRecord(1, "order-created"));
        session.addRecord(createRecord(2, "payment-received"));
        session.addRecord({ ...createRecord(3, "order-shipped"), partition: 1 });

        session.setSearchQuery("order");
        session.setPartitionFilter(["1"]);

        const counts = session.getCounts();
        assert.strictEqual(counts.total, 3);
        assert.strictEqual(counts.filtered, 1);

        const page = session.getMessages();
        assert.strictEqual(page.messages.length, 1);
        assert.strictEqual(page.messages[0].partition, "1");

        const state = session.getState();
        assert.deepStrictEqual(state.availablePartitions, ["0", "1"]);
        assert.deepStrictEqual(state.selectedFilterPartitions, ["1"]);
    });

    test("resets viewer state when consume settings are reseeded", () => {
        const session = new ConsumerSession(20);

        session.addRecord(createRecord(1));
        session.setSearchQuery("value-1");
        session.setPartitionFilter(["0"]);
        session.setTimeRangeFilter(1700000000000, 1700000000001);
        session.pause();
        session.setError(new Error("failed"));

        session.resetForConsumeSettings({
            consumeMode: "timestamp",
            consumeTimestamp: "2026-02-28T08:00:00.000Z",
            consumedPartitions: "0,2-3"
        });

        const state = session.getState();
        assert.strictEqual(state.streamState, "running");
        assert.strictEqual(state.error, undefined);
        assert.strictEqual(state.searchQuery, "");
        assert.strictEqual(state.totalMessages, 0);
        assert.deepStrictEqual(state.selectedFilterPartitions, []);
        assert.strictEqual(state.timeRangeStartMs, undefined);
        assert.strictEqual(state.timeRangeEndMs, undefined);
        assert.strictEqual(state.consumeMode, "timestamp");
        assert.strictEqual(state.consumeTimestamp, "2026-02-28T08:00:00.000Z");
        assert.strictEqual(state.consumedPartitions, "0,2-3");
    });

    test("intersects time range filter with partition and search filters", () => {
        const session = new ConsumerSession(20);

        session.addRecord(createRecord(1, "order-created"));
        session.addRecord(createRecord(2, "payment-received"));
        session.addRecord({ ...createRecord(3, "order-shipped"), partition: 1 });
        session.addRecord({ ...createRecord(4, "order-cancelled"), partition: 1 });

        session.setSearchQuery("order");
        session.setPartitionFilter(["1"]);
        session.setTimeRangeFilter(1700000000003, 1700000000004);

        const counts = session.getCounts();
        assert.strictEqual(counts.total, 4);
        assert.strictEqual(counts.filteredBeforeTimeRange, 2);
        assert.strictEqual(counts.filtered, 2);

        const page = session.getMessages();
        assert.deepStrictEqual(page.messages.map((message) => message.offset), ["4", "3"]);

        session.setTimeRangeFilter(1700000000004, 1700000000004);
        const narrowedPage = session.getMessages();
        assert.deepStrictEqual(narrowedPage.messages.map((message) => message.offset), ["4"]);

        const narrowedCounts = session.getCounts();
        assert.strictEqual(narrowedCounts.filteredBeforeTimeRange, 2);
        assert.strictEqual(narrowedCounts.filtered, 1);
    });

    test("builds histogram bins from buffered timestamps", () => {
        const session = new ConsumerSession(20);

        session.addRecord(createRecord(1, "order-created"));
        session.addRecord(createRecord(2, "payment-received"));
        session.addRecord({ ...createRecord(3, "order-shipped"), partition: 1 });
        session.addRecord({ ...createRecord(4, "order-refunded"), partition: 1 });

        session.setSearchQuery("order");
        session.setPartitionFilter(["1"]);

        const histogram = session.getHistogram(4);
        assert.strictEqual(histogram.bins.length, 10);
        assert.strictEqual(histogram.minTimestampMs, 1700000000001);
        assert.strictEqual(histogram.maxTimestampMs, 1700000000004);

        const totalCounts = histogram.bins.reduce((total, bin) => total + bin.totalCount, 0);
        const filteredCounts = histogram.bins.reduce((total, bin) => total + bin.filteredCount, 0);
        assert.strictEqual(totalCounts, 4);
        assert.strictEqual(filteredCounts, 2);
    });
});
