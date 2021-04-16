import { CompletionItemKind } from "vscode";
import { position, range, testCompletion } from "./kafkaAssert";

suite("Kafka File Completion NO FakerJS Test Suite", () => {

    test("Empty completion", async () => {
        await testCompletion('{{|}}', {
            items: []
        });

        await testCompletion('PRODUCER {{}}', {
            items: []
        });

        // topic property cannot use mustache syntax
        await testCompletion(
            'PRODUCER a\n' +
            'topic: {{|}}', {
            items: []
        });

    });

});

suite("Kafka File PRODUCER FakerJS Completion Test Suite", () => {

    test("PRODUCER FakerJS Completion (in key)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key: {{|}}'
            , {
                items: [
                    {
                        label: 'address.zipCode', kind: CompletionItemKind.Variable,
                        insertText: 'address.zipCode',
                        range: range(position(1, 7), position(1, 7))
                    }
                ]
            }, true);
    });

    test("PRODUCER FakerJS Completion (in value)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            '{{|}}'
            , {
                items: [
                    {
                        label: 'address.zipCode', kind: CompletionItemKind.Variable,
                        insertText: 'address.zipCode',
                        range: range(position(1, 2), position(1, 2))
                    }
                ]
            }, true);
    });

    test("PRODUCER FakerJS Completion (in value 2)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'topic : abcd\n' +
            '{{|}}'
            , {
                items: [
                    {
                        label: 'address.zipCode', kind: CompletionItemKind.Variable,
                        insertText: 'address.zipCode',
                        range: range(position(2, 2), position(2, 2))
                    }
                ]
            }, true);
    });

    test("PRODUCER FakerJS Completion (in value 3)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'topic : abcd\n' +
            '{{abcd|efgh}}'
            , {
                items: [
                    {
                        label: 'address.zipCode', kind: CompletionItemKind.Variable,
                        insertText: 'address.zipCode',
                        range: range(position(2, 2), position(2, 10))
                    }
                ]
            }, true);
    });
});

suite("Kafka File PRODUCER bad expression FakerJS Completion Test Suite", () => {

    test("PRODUCER FakerJS Completion (in key with not closed expression)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key: {{|'
            , {
                items: [
                    {
                        label: 'address.zipCode', kind: CompletionItemKind.Variable,
                        insertText: 'address.zipCode',
                        range: range(position(1, 7), position(1, 7))
                    }
                ]
            }, true);
    });

    test("PRODUCER FakerJS Completion (expression in expression) in key", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key: {{abcd{{|}}efgh}}'
            , {
                items: []
            });
    });

    test("PRODUCER FakerJS Completion (expression in expression) in value", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            '{{abcd{{|}}efgh}}'
            , {
                items: []
            });
    });
});

