import * as assert from "assert";
import { PlatformaticConsumerAdapter } from "../../../client/client";

/**
 * Creates a mock consumer with controllable behavior for testing the adapter.
 */
function createMockConsumer(options?: { consumeResult?: any }) {
    const calls: Record<string, any[][]> = {};

    function record(name: string, ...args: any[]) {
        if (!calls[name]) { calls[name] = []; }
        calls[name].push(args);
    }

    const mockStream = {
        handlers: {} as Record<string, Function>,
        on(event: string, handler: Function) {
            this.handlers[event] = handler;
            return this;
        },
        emit(event: string, ...args: any[]) {
            this.handlers[event]?.(...args);
        },
        close: async () => {},
    };

    const mock = {
        consume(opts: any) {
            record("consume", opts);
            return Promise.resolve(options?.consumeResult ?? mockStream);
        },
        close: async () => {},
        calls,
        mockStream,
    };

    return mock;
}

suite("PlatformaticConsumerAdapter Test Suite", () => {

    suite("seek queuing", () => {

        test("seek before run queues offsets", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "test-topic" });
            adapter.seek({ topic: "test-topic", partition: 0, offset: "42" });
            adapter.seek({ topic: "test-topic", partition: 1, offset: "100" });

            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.strictEqual(consumeCall.mode, "manual");
            assert.ok(Array.isArray(consumeCall.offsets));
            assert.strictEqual(consumeCall.offsets.length, 2);

            const p0 = consumeCall.offsets.find((o: any) => o.partition === 0);
            const p1 = consumeCall.offsets.find((o: any) => o.partition === 1);
            assert.strictEqual(p0.offset, 42n);
            assert.strictEqual(p1.offset, 100n);
        });

        test("no seeks results in latest mode", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "test-topic" });
            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.strictEqual(consumeCall.mode, "latest");
            assert.strictEqual(consumeCall.offsets, undefined);
        });

        test("fromBeginning=true uses earliest mode", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "test-topic", fromBeginning: true });
            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.strictEqual(consumeCall.mode, "earliest");
        });

        test("fromBeginning=false uses latest mode", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "test-topic", fromBeginning: false });
            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.strictEqual(consumeCall.mode, "latest");
        });

        test("seeks override fromBeginning (manual mode wins)", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "t", fromBeginning: true });
            adapter.seek({ topic: "t", partition: 0, offset: "5" });
            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.strictEqual(consumeCall.mode, "manual");
        });
    });

    suite("header conversion", () => {

        test("converts Map headers to Record", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const received: any[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => {
                    received.push(payload);
                },
            });

            const headers = new Map<Buffer | string, Buffer | string>();
            headers.set("content-type", "application/json");
            headers.set(Buffer.from("x-custom"), Buffer.from("value"));

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: Buffer.from("k"),
                value: Buffer.from("v"),
                timestamp: 1234567890n,
                offset: 42n,
                headers,
            });

            // Give the async handler a tick to process
            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(received.length, 1);
            const msg = received[0].message;
            assert.strictEqual(msg.headers["content-type"], "application/json");
            assert.ok(Buffer.isBuffer(msg.headers["x-custom"]));
            assert.strictEqual(msg.headers["x-custom"].toString(), "value");
        });

        test("accumulates duplicate header keys into arrays", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const received: any[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => { received.push(payload); },
            });

            // Buffer keys with the same string value are distinct Map entries
            const headers = new Map<Buffer | string, Buffer | string>();
            headers.set(Buffer.from("x-trace"), Buffer.from("trace-1"));
            headers.set(Buffer.from("x-trace"), Buffer.from("trace-2"));
            headers.set("unique", "solo");

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: Buffer.from("k"),
                value: Buffer.from("v"),
                timestamp: 100n,
                offset: 0n,
                headers,
            });

            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(received.length, 1);
            const msg = received[0].message;
            assert.ok(Array.isArray(msg.headers["x-trace"]));
            assert.strictEqual(msg.headers["x-trace"].length, 2);
            assert.strictEqual(msg.headers["x-trace"][0].toString(), "trace-1");
            assert.strictEqual(msg.headers["x-trace"][1].toString(), "trace-2");
            assert.strictEqual(msg.headers["unique"], "solo");
        });

        test("handles missing headers", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const received: any[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => { received.push(payload); },
            });

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: null,
                value: Buffer.from("v"),
                timestamp: 100n,
                offset: 0n,
            });

            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(received.length, 1);
            assert.deepStrictEqual(received[0].message.headers, {});
        });
    });

    suite("message field conversion", () => {

        test("converts timestamp and offset to strings", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const received: any[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => { received.push(payload); },
            });

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 3,
                key: null,
                value: Buffer.from("hello"),
                timestamp: 1709827200000n,
                offset: 99n,
                headers: new Map(),
            });

            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(received.length, 1);
            assert.strictEqual(received[0].topic, "t");
            assert.strictEqual(received[0].partition, 3);
            assert.strictEqual(received[0].message.timestamp, "1709827200000");
            assert.strictEqual(received[0].message.offset, "99");
            assert.strictEqual(received[0].message.value?.toString(), "hello");
        });

        test("handles null key and value", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const received: any[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => { received.push(payload); },
            });

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: null,
                value: null,
                timestamp: undefined,
                offset: undefined,
                headers: new Map(),
            });

            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(received.length, 1);
            assert.strictEqual(received[0].message.key, null);
            assert.strictEqual(received[0].message.value, null);
            assert.strictEqual(received[0].message.timestamp, "");
            assert.strictEqual(received[0].message.offset, "0");
        });
    });

    suite("subscribe and run", () => {

        test("passes configured partitions to consume", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any, [0, 2]);

            await adapter.subscribe({ topic: "t" });
            await adapter.run({ eachMessage: async () => {} });

            const consumeCall = mock.calls["consume"][0][0];
            assert.deepStrictEqual(consumeCall.partitions, [0, 2]);
        });

        test("throws if run called without subscribe", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await assert.rejects(
                () => adapter.run({ eachMessage: async () => {} }),
                /Must call subscribe\(\) before run\(\)/
            );
        });
    });

    suite("error propagation", () => {

        test("stream errors are forwarded to onError", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const errors: Error[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async () => {},
                onError: (err) => { errors.push(err); },
            });

            const streamError = new Error("stream failure");
            mock.mockStream.emit("error", streamError);

            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].message, "stream failure");
        });

        test("eachMessage rejections are forwarded to onError", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const errors: Error[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async () => { throw new Error("processing failed"); },
                onError: (err) => { errors.push(err); },
            });

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: null,
                value: Buffer.from("v"),
                timestamp: 100n,
                offset: 0n,
                headers: new Map(),
            });

            await new Promise(r => setTimeout(r, 10));

            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].message, "processing failed");
        });

        test("errors are silently dropped when no onError is provided", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);

            await adapter.subscribe({ topic: "t" });
            await adapter.run({ eachMessage: async () => { throw new Error("ignored"); } });

            mock.mockStream.emit("data", {
                topic: "t",
                partition: 0,
                key: null,
                value: Buffer.from("v"),
                timestamp: 100n,
                offset: 0n,
                headers: new Map(),
            });

            // Should not throw
            await new Promise(r => setTimeout(r, 10));
        });

        test("messages are processed sequentially, not concurrently", async () => {
            const mock = createMockConsumer();
            const adapter = new PlatformaticConsumerAdapter(mock as any);
            const order: string[] = [];

            await adapter.subscribe({ topic: "t" });
            await adapter.run({
                eachMessage: async (payload) => {
                    const label = payload.message.offset;
                    order.push(`start-${label}`);
                    await new Promise(r => setTimeout(r, 20));
                    order.push(`end-${label}`);
                },
            });

            const msg = (offset: bigint) => ({
                topic: "t", partition: 0, key: null,
                value: Buffer.from("v"), timestamp: 100n,
                offset, headers: new Map(),
            });

            // Emit two messages back-to-back
            mock.mockStream.emit("data", msg(1n));
            mock.mockStream.emit("data", msg(2n));

            await new Promise(r => setTimeout(r, 500));

            // Sequential: first must fully complete before second starts
            assert.deepStrictEqual(order, ["start-1", "end-1", "start-2", "end-2"]);
        });
    });
});
