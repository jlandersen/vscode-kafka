import { DiagnosticSeverity } from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertDiagnostics, diagnostic, position } from "./kafkaAssert";

suite("Kafka File Diagnostics Test Suite", () => {

    test("Empty diagnostics", async () => {
        await assertDiagnostics('', []);
    });
});

suite("Kafka File CONSUMER Diagnostics Test Suite", () => {

    test("Duplicate property validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'topic:efgh',
            [
                diagnostic(
                    position(1, 0),
                    position(1, 5),
                    "Duplicate property 'topic'",
                    DiagnosticSeverity.Warning
                ),
                diagnostic(
                    position(2, 0),
                    position(2, 5),
                    "Duplicate property 'topic'",
                    DiagnosticSeverity.Warning
                )
            ]
        );

    });

    test("Unkwown property validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'abcd:efgh',
            [
                diagnostic(
                    position(2, 0),
                    position(2, 4),
                    "Unkwown property 'abcd'",
                    DiagnosticSeverity.Warning
                )
            ]
        );

    });

    test("Syntax property validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'efgh',
            [
                diagnostic(
                    position(2, 0),
                    position(2, 4),
                    "Missing ':' sign after 'efgh'",
                    DiagnosticSeverity.Error
                ),
                diagnostic(
                    position(2, 0),
                    position(2, 4),
                    "Unkwown property 'efgh'",
                    DiagnosticSeverity.Warning
                )
            ]
        );

    });

    test("Topic validation", async () => {

        await assertDiagnostics('CONSUMER',
            [
                diagnostic(
                    position(0, 0),
                    position(0, 8),
                    'The consumer must declare the \'topic:\' property.',
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:',
            [
                diagnostic(
                    position(1, 0),
                    position(1, 5),
                    'The topic is required.',
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:a@bcd',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 11),
                    "The topic 'a@bcd' is illegal, contains a character other than ASCII alphanumerics, '.', '_' and '-'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:..',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 8),
                    "The topic cannot be '.' or '..'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:  ..  ',
            [
                diagnostic(
                    position(1, 8),
                    position(1, 10),
                    "The topic cannot be '.' or '..'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("From validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'from:abcd',
            [
                diagnostic(
                    position(2, 5),
                    position(2, 9),
                    "from must be a positive number or equal to 'earliest' or 'latest'.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'from: 10',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'from: latest',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'from: earliest',
            []
        );

    });

    test("Partitions validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'partitions:abcd',
            [
                diagnostic(
                    position(2, 11),
                    position(2, 15),
                    "Unexpected character 'a' in partitions expression.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'partitions: 10',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'partitions: 1,10',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'partitions: 1,10-20',
            []
        );

    });

    test("Key-format validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'key-format:abcd',
            [
                diagnostic(
                    position(2, 11),
                    position(2, 15),
                    "Invalid key format for 'abcd'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'key-format: string',
            []
        );

    });

    test("Value-format validation", async () => {

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-format:abcd',
            [
                diagnostic(
                    position(2, 13),
                    position(2, 17),
                    "Invalid value format for 'abcd'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-format: string',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-schema: {"type":"record","name":"Event","fields":[{"name":"id","type":"int"}]}',
            [
                diagnostic(
                    position(2, 14),
                    position(2, 84),
                    "'value-schema' requires 'value-format: avro' or 'value-format: protobuf'.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-format: avro',
            [
                diagnostic(
                    position(2, 14),
                    position(2, 18),
                    "'value-schema' is required when 'value-format: avro' is used.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-format: avro\n' +
            'value-schema: {"type":"record","name":"Event","fields":[{"name":"id","type":"int"}]}',
            []
        );

        await assertDiagnostics(
            'CONSUMER\n' +
            'topic:abcd\n' +
            'value-format: protobuf(demo.UserCreated)\n' +
            'value-schema: syntax = "proto3"; message UserCreated { int32 id = 1; }',
            [
                diagnostic(
                    position(3, 14),
                    position(3, 70),
                    "Protobuf value-schema must be a file reference like file(./schemas/event.proto).",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });

});

suite("Kafka File PRODUCER Diagnostics Test Suite", () => {

    test("Required topic and value", async () => {
        await assertDiagnostics(
            'PRODUCER',
            [
                diagnostic(
                    position(0, 0),
                    position(0, 8),
                    'The producer must declare the \'topic:\' property.',
                    DiagnosticSeverity.Error
                ),
                diagnostic(
                    position(0, 0),
                    position(0, 8),
                    'The producer value is required.',
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:',
            [
                diagnostic(
                    position(1, 0),
                    position(1, 5),
                    'The topic is required.',
                    DiagnosticSeverity.Error
                ),
                diagnostic(
                    position(0, 0),
                    position(0, 8),
                    'The producer value is required.',
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("Syntax topic", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:a@bcd\n' +
            'abcd',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 11),
                    "The topic 'a@bcd' is illegal, contains a character other than ASCII alphanumerics, '.', '_' and '-'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:..\n' +
            'abcd',
            [
                diagnostic(
                    position(1, 6),
                    position(1, 8),
                    "The topic cannot be '.' or '..'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("Key-format validation", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'key-format:abcd\n' +
            'efgh',
            [
                diagnostic(
                    position(2, 11),
                    position(2, 15),
                    "Invalid key format for 'abcd'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'key-format: string\n' +
            'efgh',
            []
        );

    });

    test("Value-format validation", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format:abcd\n' +
            'efgh',
            [
                diagnostic(
                    position(2, 13),
                    position(2, 17),
                    "Invalid value format for 'abcd'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: string\n' +
            'efgh',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: json\n' +
            '{"id": 1}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: json\n' +
            '{"id":}',
            [
                diagnostic(
                    position(3, 0),
                    position(4, 0),
                    'Invalid JSON value.',
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: string\n' +
            'value-schema: {"type":"object"}\n' +
            'efgh',
            [
                diagnostic(
                    position(3, 14),
                    position(3, 31),
                    "'value-schema' requires 'value-format: json', 'value-format: avro', or 'value-format: protobuf'.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: avro\n' +
            'value-schema: {"type":"record","name":"Event","fields":[{"name":"id","type":"int"}]}\n' +
            '{"name": "john"}',
            [
                diagnostic(
                    position(4, 0),
                    position(5, 0),
                    "Avro value at 'id' does not match the schema (expected \"int\").",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: avro\n' +
            'value-schema: {"type":"record","name":"Event","fields":[{"name":"id","type":"int"}]}\n' +
            '{"id": 1}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: protobuf(demo.UserCreated)\n' +
            'value-schema: syntax = "proto3"; message UserCreated { int32 id = 1; }\n' +
            '{"id": 1}',
            [
                diagnostic(
                    position(3, 14),
                    position(3, 70),
                    "Protobuf value-schema must be a file reference like file(./schemas/event.proto).",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: json\n' +
            'value-schema: {"type":"object","required":["id"],"properties":{"id":{"type":"number"}}}\n' +
            '{"name": "john"}',
            [
                diagnostic(
                    position(4, 0),
                    position(5, 0),
                    "JSON value must have required property 'id'.",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: json\n' +
            'value-schema: {"$id":"https://example.com/address.schema.json","type":"object","required":["countryName"],"properties":{"countryName":{"type":"string"}}}\n' +
            '{"countryName": "FR"}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'value-format: json\n' +
            'value-schema: {"$id":"https://example.com/address.schema.json","type":"object","required":["countryName"],"properties":{"countryName":{"type":"string"}}}\n' +
            '{"countryName": "FR"}',
            []
        );

        const schemaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-kafka-schema-'));
        const schemaFile = path.join(schemaDir, 'event.schema.json');
        try {
            fs.writeFileSync(schemaFile, '{"type":"object","required":["id"],"properties":{"id":{"type":"number"}}}', 'utf8');

            await assertDiagnostics(
                'PRODUCER\n' +
                'topic:abcd\n' +
                'value-format: json\n' +
                `value-schema: file(${schemaFile})\n` +
                '{"name": "john"}',
                [
                    diagnostic(
                        position(4, 0),
                        position(5, 0),
                        "JSON value must have required property 'id'.",
                        DiagnosticSeverity.Error
                    )
                ]
            );
        } finally {
            fs.rmSync(schemaDir, { recursive: true, force: true });
        }

    });

});

