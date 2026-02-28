import * as assert from "assert";

import { getSchemaDocumentLanguage, SchemaRegistryDocumentProvider } from "../../../schema-registry";

suite("Schema Registry Document Provider Test Suite", () => {
    test("maps schema type to language and extension", () => {
        assert.deepStrictEqual(getSchemaDocumentLanguage("AVRO"), { language: "json", extension: "avsc" });
        assert.deepStrictEqual(getSchemaDocumentLanguage("PROTOBUF"), { language: "proto3", extension: "proto" });
        assert.deepStrictEqual(getSchemaDocumentLanguage("JSON"), { language: "json", extension: "json" });
    });

    test("renders metadata header for schema version", () => {
        const provider = new SchemaRegistryDocumentProvider();
        const content = provider.buildDocumentContent({
            subject: "orders-value",
            version: 3,
            schemaType: "AVRO",
            schema: "{\"type\":\"record\"}",
            id: 42,
            references: []
        });

        assert.ok(content.includes("# Subject: orders-value"));
        assert.ok(content.includes("# Version: 3"));
        assert.ok(content.includes("{\"type\":\"record\"}"));
    });
});
