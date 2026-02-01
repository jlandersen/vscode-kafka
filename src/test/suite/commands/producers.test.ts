import * as assert from "assert";
import { processCustomHelpers, parseTimeInterval } from "../../../commands/producers";

suite("Producer Custom Helpers Test Suite", () => {
    
    test("should replace {{$timestamp}} with current timestamp", () => {
        const before = Date.now();
        const result = processCustomHelpers("{{$timestamp}}");
        const after = Date.now();
        
        const timestamp = parseInt(result, 10);
        assert.ok(timestamp >= before && timestamp <= after, "Timestamp should be within test execution time");
    });

    test("should replace {{$date.now}} with current timestamp", () => {
        const before = Date.now();
        const result = processCustomHelpers("{{$date.now}}");
        const after = Date.now();
        
        const timestamp = parseInt(result, 10);
        assert.ok(timestamp >= before && timestamp <= after, "Timestamp should be within test execution time");
    });

    test("should replace {{$date.iso}} with ISO 8601 formatted date", () => {
        const result = processCustomHelpers("{{$date.iso}}");
        
        // Check if result is a valid ISO 8601 date
        const date = new Date(result);
        assert.ok(!isNaN(date.getTime()), "Result should be a valid ISO date");
        assert.ok(result.includes("T"), "ISO date should contain T separator");
        assert.ok(result.includes("Z") || result.includes("+") || result.includes("-"), "ISO date should have timezone");
    });

    test("should replace {{$date.unix}} with Unix timestamp in seconds", () => {
        const before = Math.floor(Date.now() / 1000);
        const result = processCustomHelpers("{{$date.unix}}");
        const after = Math.floor(Date.now() / 1000);
        
        const unixTimestamp = parseInt(result, 10);
        assert.ok(unixTimestamp >= before && unixTimestamp <= after, "Unix timestamp should be within test execution time");
    });

    test("should handle multiple placeholders in one string", () => {
        const result = processCustomHelpers("timestamp: {{$timestamp}}, iso: {{$date.iso}}, unix: {{$date.unix}}");
        
        assert.ok(result.includes("timestamp: "), "Should contain timestamp label");
        assert.ok(result.includes(", iso: "), "Should contain iso label");
        assert.ok(result.includes(", unix: "), "Should contain unix label");
        assert.ok(!result.includes("{{"), "Should not contain unreplaced placeholders");
    });

    test("should not modify regular faker placeholders", () => {
        const result = processCustomHelpers("{{person.firstName}} {{string.uuid}}");
        
        assert.strictEqual(result, "{{person.firstName}} {{string.uuid}}", "Regular faker placeholders should remain unchanged");
    });

    test("should handle mixed custom and faker placeholders", () => {
        const input = "name: {{person.firstName}}, timestamp: {{$timestamp}}";
        const result = processCustomHelpers(input);
        
        assert.ok(result.includes("{{person.firstName}}"), "Faker placeholder should remain");
        assert.ok(!result.includes("{{$timestamp}}"), "Custom placeholder should be replaced");
        assert.ok(result.match(/timestamp: \d+/), "Timestamp should be replaced with a number");
    });

    test("should handle empty string", () => {
        const result = processCustomHelpers("");
        assert.strictEqual(result, "", "Empty string should remain empty");
    });

    test("should handle string without placeholders", () => {
        const input = "just a regular string";
        const result = processCustomHelpers(input);
        assert.strictEqual(result, input, "String without placeholders should remain unchanged");
    });
});

suite("Producer Time Interval Parser Test Suite", () => {
    
    test("should parse seconds correctly", () => {
        assert.strictEqual(parseTimeInterval("1s"), 1000);
        assert.strictEqual(parseTimeInterval("3s"), 3000);
        assert.strictEqual(parseTimeInterval("30s"), 30000);
        assert.strictEqual(parseTimeInterval("60s"), 60000);
    });

    test("should parse minutes correctly", () => {
        assert.strictEqual(parseTimeInterval("1m"), 60000);
        assert.strictEqual(parseTimeInterval("5m"), 300000);
        assert.strictEqual(parseTimeInterval("10m"), 600000);
        assert.strictEqual(parseTimeInterval("60m"), 3600000);
    });

    test("should parse hours correctly", () => {
        assert.strictEqual(parseTimeInterval("1h"), 3600000);
        assert.strictEqual(parseTimeInterval("2h"), 7200000);
        assert.strictEqual(parseTimeInterval("24h"), 86400000);
    });

    test("should return undefined for invalid formats", () => {
        assert.strictEqual(parseTimeInterval(""), undefined);
        assert.strictEqual(parseTimeInterval("abc"), undefined);
        assert.strictEqual(parseTimeInterval("10"), undefined);
        assert.strictEqual(parseTimeInterval("s"), undefined);
        assert.strictEqual(parseTimeInterval("10x"), undefined);
        assert.strictEqual(parseTimeInterval("10 s"), undefined);
        assert.strictEqual(parseTimeInterval("-5s"), undefined);
    });

    test("should handle leading zeros", () => {
        assert.strictEqual(parseTimeInterval("01s"), 1000);
        assert.strictEqual(parseTimeInterval("05m"), 300000);
        assert.strictEqual(parseTimeInterval("001h"), 3600000);
    });

    test("should handle large numbers", () => {
        assert.strictEqual(parseTimeInterval("100s"), 100000);
        assert.strictEqual(parseTimeInterval("999m"), 59940000);
        assert.strictEqual(parseTimeInterval("100h"), 360000000);
    });
});
