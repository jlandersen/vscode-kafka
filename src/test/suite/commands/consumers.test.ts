import * as assert from "assert";
import * as vscode from "vscode";
import { EditConsumerGroupOffsetsCommandHandler } from "../../../commands/consumers";

suite("Consumer Commands Test Suite", () => {
    test("offset editor webview content includes CSP and stylesheet link", () => {
        const handler = new EditConsumerGroupOffsetsCommandHandler(
            {} as any,
            {} as any,
            vscode.Uri.parse("file:///extension")
        );
        const webview = {
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: vscode.Uri) => uri
        };

        const html = (handler as any).getWebviewContent(webview, "group-1", "Stable", []);

        assert.ok(html.includes("Content-Security-Policy"));
        assert.ok(html.includes("default-src 'none'; style-src vscode-resource:; script-src 'nonce-"));
        assert.ok(html.includes("edit-consumer-group-offsets.css"));
        assert.ok(!html.includes("<style>"));
        assert.ok(!html.includes("style=\""));
    });
});
