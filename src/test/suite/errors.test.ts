import * as assert from "assert";
import { getErrorMessage } from "../../errors";

suite("Error Message Extraction Test Suite", () => {
    
    suite("KafkaJSDeleteGroupsError", () => {
        test("should extract group details from KafkaJSDeleteGroupsError", () => {
            const error = {
                name: "KafkaJSDeleteGroupsError",
                message: "Error in Delete groups",
                groups: [
                    {
                        groupId: "test-consumer-group",
                        errorCode: 26,
                        error: {
                            name: "KafkaJSProtocolError",
                            message: "The consumer group is not empty",
                        }
                    }
                ]
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Error in Delete groups"), "Should include base message");
            assert.ok(result.includes("test-consumer-group"), "Should include group ID");
            assert.ok(result.includes("The consumer group is not empty"), "Should include error details");
            assert.ok(result.includes("error code: 26"), "Should include error code");
        });

        test("should handle multiple groups in KafkaJSDeleteGroupsError", () => {
            const error = {
                name: "KafkaJSDeleteGroupsError",
                message: "Error in Delete groups",
                groups: [
                    {
                        groupId: "group1",
                        errorCode: 26,
                        error: { message: "Not empty" }
                    },
                    {
                        groupId: "group2",
                        errorCode: 15,
                        error: { message: "Invalid group" }
                    }
                ]
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("group1"), "Should include first group ID");
            assert.ok(result.includes("group2"), "Should include second group ID");
            assert.ok(result.includes("Not empty"), "Should include first error");
            assert.ok(result.includes("Invalid group"), "Should include second error");
        });

        test("should handle KafkaJSDeleteGroupsError with only error codes", () => {
            const error = {
                name: "KafkaJSDeleteGroupsError",
                message: "Error in Delete groups",
                groups: [
                    {
                        groupId: "test-group",
                        errorCode: 15
                    }
                ]
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("test-group"), "Should include group ID");
            assert.ok(result.includes("error code 15"), "Should include error code");
        });

        test("should handle KafkaJSDeleteGroupsError without groups", () => {
            const error = {
                name: "KafkaJSDeleteGroupsError",
                message: "Error in Delete groups"
            };
            
            const result = getErrorMessage(error);
            assert.strictEqual(result, "Error in Delete groups", "Should return base message only");
        });
    });

    suite("KafkaJSProtocolError", () => {
        test("should extract error code and type from KafkaJSProtocolError", () => {
            const error = {
                name: "KafkaJSProtocolError",
                message: "Invalid topic",
                code: 17,
                type: "INVALID_TOPIC_EXCEPTION"
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Invalid topic"), "Should include message");
            assert.ok(result.includes("type: INVALID_TOPIC_EXCEPTION"), "Should include error type");
            assert.ok(result.includes("code: 17"), "Should include error code");
        });

        test("should handle KafkaJSProtocolError with only error code", () => {
            const error = {
                name: "KafkaJSProtocolError",
                message: "Protocol error",
                code: 5
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Protocol error"), "Should include message");
            assert.ok(result.includes("code: 5"), "Should include error code");
        });

        test("should handle KafkaJSProtocolError with only error type", () => {
            const error = {
                name: "KafkaJSProtocolError",
                message: "Protocol error",
                type: "UNKNOWN_ERROR"
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Protocol error"), "Should include message");
            assert.ok(result.includes("type: UNKNOWN_ERROR"), "Should include error type");
        });
    });

    suite("KafkaJSConnectionError", () => {
        test("should extract broker information from KafkaJSConnectionError", () => {
            const error = {
                name: "KafkaJSConnectionError",
                message: "Connection timeout",
                broker: "localhost:9092"
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Connection timeout"), "Should include message");
            assert.ok(result.includes("Broker: localhost:9092"), "Should include broker information");
        });

        test("should handle KafkaJSConnectionError without broker", () => {
            const error = {
                name: "KafkaJSConnectionError",
                message: "Connection timeout"
            };
            
            const result = getErrorMessage(error);
            assert.strictEqual(result, "Connection timeout", "Should return message only");
        });
    });

    suite("KafkaJSRequestTimeoutError", () => {
        test("should extract timing details from KafkaJSRequestTimeoutError", () => {
            const error = {
                name: "KafkaJSRequestTimeoutError",
                message: "Request timed out",
                broker: "localhost:9092",
                correlationId: 12345,
                pendingDuration: 30000
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Request timed out"), "Should include message");
            assert.ok(result.includes("broker: localhost:9092"), "Should include broker");
            assert.ok(result.includes("correlation ID: 12345"), "Should include correlation ID");
            assert.ok(result.includes("pending: 30000ms"), "Should include pending duration");
        });

        test("should handle KafkaJSRequestTimeoutError with partial info", () => {
            const error = {
                name: "KafkaJSRequestTimeoutError",
                message: "Request timed out",
                broker: "localhost:9092"
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Request timed out"), "Should include message");
            assert.ok(result.includes("broker: localhost:9092"), "Should include broker");
        });
    });

    suite("Generic KafkaJS Errors", () => {
        test("should extract retry information from KafkaJS errors", () => {
            const error = {
                name: "KafkaJSError",
                message: "Operation failed",
                retriable: true,
                retryCount: 5,
                retryTime: 15000
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Operation failed"), "Should include message");
            assert.ok(result.includes("retriable"), "Should indicate retriable");
            assert.ok(result.includes("retries: 5"), "Should include retry count");
            assert.ok(result.includes("retry time: 15000ms"), "Should include retry time");
        });

        test("should indicate non-retriable errors", () => {
            const error = {
                name: "KafkaJSNonRetriableError",
                message: "Fatal error",
                retriable: false
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Fatal error"), "Should include message");
            assert.ok(result.includes("non-retriable"), "Should indicate non-retriable");
        });

        test("should include cause if available", () => {
            const error = {
                name: "KafkaJSError",
                message: "Operation failed",
                cause: {
                    message: "Network unreachable"
                }
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Operation failed"), "Should include message");
            assert.ok(result.includes("Caused by: Network unreachable"), "Should include cause");
        });

        test("should include help URL if available", () => {
            const error = {
                name: "KafkaJSError",
                message: "Configuration error",
                helpUrl: "https://kafka.js.org/docs/configuration"
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Configuration error"), "Should include message");
            assert.ok(result.includes("See: https://kafka.js.org/docs/configuration"), "Should include help URL");
        });
    });

    suite("Standard Errors", () => {
        test("should handle standard Error objects", () => {
            const error = new Error("Standard error message");
            
            const result = getErrorMessage(error);
            assert.strictEqual(result, "Standard error message", "Should return error message");
        });

        test("should handle Error without message", () => {
            const error = new Error();
            
            const result = getErrorMessage(error);
            assert.strictEqual(result, "", "Should return empty string");
        });
    });

    suite("String and Other Types", () => {
        test("should handle string errors", () => {
            const result = getErrorMessage("Simple error string");
            assert.strictEqual(result, "Simple error string", "Should return the string");
        });

        test("should handle number errors", () => {
            const result = getErrorMessage(404);
            assert.strictEqual(result, "404", "Should convert number to string");
        });

        test("should handle null", () => {
            const result = getErrorMessage(null);
            assert.strictEqual(result, "null", "Should handle null");
        });

        test("should handle undefined", () => {
            const result = getErrorMessage(undefined);
            assert.strictEqual(result, "undefined", "Should handle undefined");
        });

        test("should handle symbol values", () => {
            const result = getErrorMessage(Symbol("failure"));
            assert.strictEqual(result, "Symbol(failure)", "Should stringify symbol");
        });

        test("should handle object without message", () => {
            const error = { code: 123, status: "failed" };
            const result = getErrorMessage(error);
            assert.ok(result.includes("Object") || result.includes("object"), "Should stringify object");
        });
    });

    suite("Complex Scenarios", () => {
        test("should handle KafkaJS error with all metadata", () => {
            const error = {
                name: "KafkaJSError",
                message: "Complex error",
                retriable: true,
                retryCount: 3,
                retryTime: 5000,
                helpUrl: "https://kafka.js.org/docs/errors",
                cause: {
                    message: "Underlying issue"
                }
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Complex error"), "Should include message");
            assert.ok(result.includes("retriable"), "Should include retriable");
            assert.ok(result.includes("retries: 3"), "Should include retry count");
            assert.ok(result.includes("retry time: 5000ms"), "Should include retry time");
            assert.ok(result.includes("Caused by: Underlying issue"), "Should include cause");
            assert.ok(result.includes("See: https://kafka.js.org/docs/errors"), "Should include help URL");
        });

        test("should handle deeply nested error information", () => {
            const error = {
                name: "KafkaJSDeleteGroupsError",
                message: "Cannot delete groups",
                groups: [
                    {
                        groupId: "nested-group",
                        errorCode: 26,
                        error: {
                            name: "KafkaJSProtocolError",
                            message: "Group not empty",
                            code: 26,
                            type: "NON_EMPTY_GROUP"
                        }
                    }
                ]
            };
            
            const result = getErrorMessage(error);
            assert.ok(result.includes("Cannot delete groups"), "Should include base message");
            assert.ok(result.includes("nested-group"), "Should include group ID");
            assert.ok(result.includes("Group not empty"), "Should include nested error message");
        });
    });
});
