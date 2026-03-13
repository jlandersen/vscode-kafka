import * as assert from "assert";
import { PlatformaticProducerAdapter } from "../../../client/client";

function createMockProducer() {
    const calls: Record<string, any[][]> = {};

    function record(name: string, ...args: any[]) {
        if (!calls[name]) { calls[name] = []; }
        calls[name].push(args);
    }

    return {
        send(opts: any) {
            record("send", opts);
            return Promise.resolve({ offsets: [] });
        },
        close: async () => {},
        calls,
    };
}

suite("PlatformaticProducerAdapter Test Suite", () => {

    test("send converts messages to Buffer format", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "test-topic",
            messages: [
                { key: "key1", value: "value1" },
            ],
        });

        const sendCall = mock.calls["send"][0][0];
        assert.strictEqual(sendCall.messages.length, 1);

        const msg = sendCall.messages[0];
        assert.strictEqual(msg.topic, "test-topic");
        assert.ok(Buffer.isBuffer(msg.key));
        assert.strictEqual(msg.key.toString(), "key1");
        assert.ok(Buffer.isBuffer(msg.value));
        assert.strictEqual(msg.value.toString(), "value1");
    });

    test("send handles null key", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "t",
            messages: [{ key: null, value: "v" }],
        });

        const msg = mock.calls["send"][0][0].messages[0];
        assert.strictEqual(msg.key, undefined);
    });

    test("send handles null value", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "t",
            messages: [{ value: null }],
        });

        const msg = mock.calls["send"][0][0].messages[0];
        assert.strictEqual(msg.value, undefined);
    });

    test("send converts headers from Record to Map", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "t",
            messages: [{
                value: "v",
                headers: { "content-type": "text/plain", "x-id": Buffer.from("123") },
            }],
        });

        const msg = mock.calls["send"][0][0].messages[0];
        assert.ok(msg.headers instanceof Map);
        assert.strictEqual(msg.headers.size, 2);
    });

    test("send passes compression option", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "t",
            messages: [{ value: "v" }],
            compression: 1,
        });

        const sendCall = mock.calls["send"][0][0];
        assert.strictEqual(sendCall.compression, "gzip");
    });

    test("send passes acks option", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        await adapter.send({
            topic: "t",
            messages: [{ value: "v" }],
            acks: -1,
        });

        const sendCall = mock.calls["send"][0][0];
        assert.strictEqual(sendCall.acks, -1);
    });

    test("send preserves Buffer key and value without coercion", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        const binaryKey = Buffer.from([0x00, 0x01, 0x02, 0xff]);
        const binaryValue = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

        await adapter.send({
            topic: "t",
            messages: [{ key: binaryKey as any, value: binaryValue as any }],
        });

        const msg = mock.calls["send"][0][0].messages[0];
        assert.ok(Buffer.isBuffer(msg.key));
        assert.ok(Buffer.isBuffer(msg.value));
        assert.ok(msg.key.equals(binaryKey), "Binary key should be preserved exactly");
        assert.ok(msg.value.equals(binaryValue), "Binary value should be preserved exactly");
    });

    test("send does not corrupt Buffer with null bytes", async () => {
        const mock = createMockProducer();
        const adapter = new PlatformaticProducerAdapter(mock as any);

        const value = Buffer.from([0x00, 0x00, 0x01]);

        await adapter.send({
            topic: "t",
            messages: [{ value: value as any }],
        });

        const msg = mock.calls["send"][0][0].messages[0];
        assert.strictEqual(msg.value.length, 3, "Buffer length should be preserved");
        assert.ok(msg.value.equals(value));
    });
});
