import * as assert from "assert";
import { buildConsumerConfig, PlatformaticClientConfig } from "../../../client/client";
import { ConsumerConfig } from "../../../client/types";

suite("Build Consumer Config Test Suite", () => {

    const baseConfig: PlatformaticClientConfig = {
        clientId: "test-client",
        bootstrapBrokers: ["localhost:9092"],
    };

    test("includes groupId from consumer config", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "my-group" });
        assert.strictEqual(result.groupId, "my-group");
    });

    test("spreads base client config", () => {
        const config: PlatformaticClientConfig = {
            clientId: "test-client",
            bootstrapBrokers: ["broker1:9092", "broker2:9092"],
            sasl: { mechanism: "PLAIN", username: "user", password: "pass" },
            tls: { rejectUnauthorized: false },
        };
        const result = buildConsumerConfig(config, { groupId: "g" });
        assert.strictEqual(result.clientId, "test-client");
        assert.deepStrictEqual(result.bootstrapBrokers, ["broker1:9092", "broker2:9092"]);
        assert.deepStrictEqual(result.sasl, { mechanism: "PLAIN", username: "user", password: "pass" });
        assert.deepStrictEqual(result.tls, { rejectUnauthorized: false });
    });

    test("excludes sessionTimeout when undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", sessionTimeout: undefined });
        assert.strictEqual(result.hasOwnProperty("sessionTimeout"), false);
    });

    test("includes sessionTimeout when defined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", sessionTimeout: 30000 });
        assert.strictEqual(result.sessionTimeout, 30000);
    });

    test("excludes rebalanceTimeout when undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", rebalanceTimeout: undefined });
        assert.strictEqual(result.hasOwnProperty("rebalanceTimeout"), false);
    });

    test("includes rebalanceTimeout when defined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", rebalanceTimeout: 60000 });
        assert.strictEqual(result.rebalanceTimeout, 60000);
    });

    test("excludes heartbeatInterval when undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", heartbeatInterval: undefined });
        assert.strictEqual(result.hasOwnProperty("heartbeatInterval"), false);
    });

    test("includes heartbeatInterval when defined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", heartbeatInterval: 3000 });
        assert.strictEqual(result.heartbeatInterval, 3000);
    });

    test("excludes minBytes when undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", minBytes: undefined });
        assert.strictEqual(result.hasOwnProperty("minBytes"), false);
    });

    test("includes minBytes when defined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", minBytes: 1 });
        assert.strictEqual(result.minBytes, 1);
    });

    test("excludes maxBytes when undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", maxBytes: undefined });
        assert.strictEqual(result.hasOwnProperty("maxBytes"), false);
    });

    test("includes maxBytes when defined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", maxBytes: 1048576 });
        assert.strictEqual(result.maxBytes, 1048576);
    });

    test("excludes maxWaitTime when maxWaitTimeInMs is undefined", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", maxWaitTimeInMs: undefined });
        assert.strictEqual(result.hasOwnProperty("maxWaitTime"), false);
    });

    test("maps maxWaitTimeInMs to maxWaitTime", () => {
        const result = buildConsumerConfig(baseConfig, { groupId: "g", maxWaitTimeInMs: 5000 });
        assert.strictEqual(result.maxWaitTime, 5000);
        assert.strictEqual(result.hasOwnProperty("maxWaitTimeInMs"), false);
    });

    test("with all options undefined, only groupId and base config present", () => {
        const config: ConsumerConfig = {
            groupId: "g",
            sessionTimeout: undefined,
            rebalanceTimeout: undefined,
            heartbeatInterval: undefined,
            minBytes: undefined,
            maxBytes: undefined,
            maxWaitTimeInMs: undefined,
        };
        const result = buildConsumerConfig(baseConfig, config);
        assert.deepStrictEqual(Object.keys(result).sort(), ["bootstrapBrokers", "clientId", "groupId"]);
    });

    test("with all options defined, all keys present", () => {
        const config: ConsumerConfig = {
            groupId: "g",
            sessionTimeout: 30000,
            rebalanceTimeout: 60000,
            heartbeatInterval: 3000,
            minBytes: 1,
            maxBytes: 1048576,
            maxWaitTimeInMs: 5000,
        };
        const result = buildConsumerConfig(baseConfig, config);
        assert.strictEqual(result.sessionTimeout, 30000);
        assert.strictEqual(result.rebalanceTimeout, 60000);
        assert.strictEqual(result.heartbeatInterval, 3000);
        assert.strictEqual(result.minBytes, 1);
        assert.strictEqual(result.maxBytes, 1048576);
        assert.strictEqual(result.maxWaitTime, 5000);
    });
});
