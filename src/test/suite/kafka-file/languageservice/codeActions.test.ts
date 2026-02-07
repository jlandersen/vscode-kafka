import * as assert from "assert";
import { CodeActionContext, CodeActionTriggerKind, EndOfLine, workspace } from "vscode";
import { getSimpleLanguageService } from "./kafkaAssert";

suite("Kafka File Code Actions Test Suite", () => {

    test("Add topic property for consumer", async () => {
        const languageService = getSimpleLanguageService();
        const document = await workspace.openTextDocument({
            language: "kafka",
            content: "CONSUMER"
        });
        const ast = languageService.parseKafkaFileDocument(document);
        const diagnostics = await languageService.doDiagnostics(document, ast, true);
        const context: CodeActionContext = { diagnostics, only: undefined, triggerKind: CodeActionTriggerKind.Invoke };
        const actions = languageService.getCodeActions(document, ast, context);
        const action = actions.find(item => item.title === "Add 'topic' property");
        assert.ok(action?.edit, "Expected code action edit for consumer topic");
        await workspace.applyEdit(action!.edit!);
        const updatedDoc = await workspace.openTextDocument(document.uri);
        const updated = updatedDoc.getText();
        const eol = updatedDoc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
        assert.strictEqual(updated, `CONSUMER${eol}topic: `);
    });

    test("Add topic property for producer", async () => {
        const languageService = getSimpleLanguageService();
        const document = await workspace.openTextDocument({
            language: "kafka",
            content: "PRODUCER"
        });
        const ast = languageService.parseKafkaFileDocument(document);
        const diagnostics = await languageService.doDiagnostics(document, ast, true);
        const context: CodeActionContext = { diagnostics, only: undefined, triggerKind: CodeActionTriggerKind.Invoke };
        const actions = languageService.getCodeActions(document, ast, context);
        const action = actions.find(item => item.title === "Add 'topic' property");
        assert.ok(action?.edit, "Expected code action edit for producer topic");
        await workspace.applyEdit(action!.edit!);
        const updatedDoc = await workspace.openTextDocument(document.uri);
        const updated = updatedDoc.getText();
        const eol = updatedDoc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
        assert.strictEqual(updated, `PRODUCER${eol}topic: `);
    });

    test("Insert ':' for missing assigner", async () => {
        const languageService = getSimpleLanguageService();
        const document = await workspace.openTextDocument({
            language: "kafka",
            content: "CONSUMER\ntopic:abcd\nkey"
        });
        const ast = languageService.parseKafkaFileDocument(document);
        const diagnostics = await languageService.doDiagnostics(document, ast, true);
        const context: CodeActionContext = { diagnostics, only: undefined, triggerKind: CodeActionTriggerKind.Invoke };
        const actions = languageService.getCodeActions(document, ast, context);
        const action = actions.find(item => item.title === "Insert ':' after 'key'");
        assert.ok(action?.edit, "Expected code action edit for missing ':'");
        await workspace.applyEdit(action!.edit!);
        const updatedDoc = await workspace.openTextDocument(document.uri);
        const updated = updatedDoc.getText();
        const eol = updatedDoc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
        assert.strictEqual(updated, `CONSUMER${eol}topic:abcd${eol}key: `);
    });
});
