import { DiagnosticSeverity } from "vscode";
import { assertDiagnostics, diagnostic, position } from "./kafkaAssert";

suite("Kafka File PRODUCER FakerJS Diagnostics Test Suite", () => {

    test("Valid FakerJS expressions", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words}}abcd{{random.words}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words}}\n' +
            '{{random.words}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words(5)}}',
            []
        );

    });

    test("FakerJS syntax validation missing open", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'random.words}}',
            [
                diagnostic(
                    position(2, 0),
                    position(2, 12),
                    "FakerJS expression 'random.words' must be opened with '{{'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing open 2", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words}}\n' +
            'random.words}}',
            [
                diagnostic(
                    position(2, 16),
                    position(3, 12),
                    "FakerJS expression '\nrandom.words' must be opened with '{{'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation unexpected token {{", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.w{{ords}}',
            [
                diagnostic(
                    position(2, 10),
                    position(2, 12),
                    "Unexpected token '{{' in expression 'random.w{{ords'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing close", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 14),
                    "FakerJS expression 'random.words' must be closed with '}}'",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });

    test("FakerJS syntax validation bad close", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words{{',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 16),
                    "FakerJS expression 'random.words{{' must be closed with '}}'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing close 2", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words\n' +
            '{{random.words}}',
            [
                diagnostic(
                    position(3, 0),
                    position(3, 2),
                    "Unexpected token '{{' in expression 'random.words\n{{random.words'",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });

    test("Invalid module validation", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{BAD_MODULE.words(5)}}',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 12),
                    "Invalid module: 'BAD_MODULE'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("Invalid method validation", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.BAD_METHOD}}',
            [
                diagnostic(
                    position(2, 9),
                    position(2, 19),
                    "Invalid method: 'BAD_METHOD'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words()}}',
            [
                diagnostic(
                    position(2, 9),
                    position(2, 16),
                    "Invalid method: 'words()'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words(}}',
            [
                diagnostic(
                    position(2, 9),
                    position(2, 15),
                    "Invalid method: 'words('",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{random.words(5)}}',
            []);
    });

    test("FakerJS validation in key property", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'key: key-{{BAD_MODULE.words(5)}}\n' +
            'abcd',
            [
                diagnostic(
                    position(2, 11),
                    position(2, 21),
                    "Invalid module: 'BAD_MODULE'",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });
});

