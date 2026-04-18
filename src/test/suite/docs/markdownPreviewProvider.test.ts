import * as assert from "assert";
import * as path from "path";
import {
    getDocumentationPagePath,
    getDocumentationPageUri,
    normalizeDocumentationPage,
    normalizeDocumentationSection
} from "../../../docs/markdownPreviewProvider";

suite("Markdown Preview Provider Test Suite", () => {
    test("normalizes supported documentation pages", () => {
        assert.strictEqual(normalizeDocumentationPage("Consuming.md"), "Consuming");
        assert.strictEqual(normalizeDocumentationPage("Explorer"), "Explorer");
    });

    test("rejects unsupported documentation pages", () => {
        assert.strictEqual(normalizeDocumentationPage("../README"), undefined);
        assert.strictEqual(normalizeDocumentationPage("Unknown"), undefined);
    });

    test("normalizes safe documentation sections", () => {
        assert.strictEqual(normalizeDocumentationSection("kafka-file"), "kafka-file");
        assert.strictEqual(normalizeDocumentationSection("Serializer"), "Serializer");
        assert.strictEqual(normalizeDocumentationSection(undefined), "");
    });

    test("rejects unsafe documentation sections", () => {
        assert.strictEqual(normalizeDocumentationSection("foo\" bar"), undefined);
        assert.strictEqual(normalizeDocumentationSection("../section"), undefined);
    });

    test("builds encoded command uri arguments", () => {
        assert.strictEqual(
            getDocumentationPageUri("Producing", "serializer"),
            `command:vscode-kafka.open.docs.page?${encodeURIComponent(JSON.stringify([{ page: "Producing", section: "serializer" }]))}`
        );
    });

    test("resolves documentation paths under docs root", () => {
        assert.strictEqual(
            getDocumentationPagePath("/extension", "README"),
            path.join("/extension", "docs", "README.md")
        );
    });
});
