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
});
