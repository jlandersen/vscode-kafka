import * as assert from "assert";
import { CodeActionContext, CodeActionTriggerKind, workspace } from "vscode";
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
        const updated = (await workspace.openTextDocument(document.uri)).getText();
        assert.strictEqual(updated, "CONSUMER\ntopic: ");
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
        const updated = (await workspace.openTextDocument(document.uri)).getText();
        assert.strictEqual(updated, "PRODUCER\ntopic: ");
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
        const updated = (await workspace.openTextDocument(document.uri)).getText();
        assert.strictEqual(updated, "CONSUMER\ntopic:abcd\nkey: ");
    });
});
