import { DiagnosticSeverity } from "vscode";
import { assertDiagnostics, diagnostic, position } from "./kafkaAssert";

suite("Kafka File PRODUCER FakerJS Diagnostics Test Suite", () => {

    test("Valid FakerJS expressions", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words}}',
            []
        );

        // Custom helpers with $ prefix should be valid
        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{$timestamp}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{$date.now}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{$date.iso}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{$date.unix}}',
            []
        );

        // Mix of custom helpers and faker expressions
        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{"timestamp": {{$timestamp}}, "name": "{{person.firstName}}"}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words}}abcd{{lorem.words}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words}}\n' +
            '{{lorem.words}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words(5)}}',
            []
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            `
            {{location.zipCode}}
            {{location.city}}
            {{location.streetAddress}}
            {{location.secondaryAddress}}
            {{location.county}}
            {{location.country}}
            {{location.countryCode}}
            {{location.state}}
            {{location.latitude}}
            {{location.longitude}}
            {{location.direction}}
            {{location.cardinalDirection}}
            {{location.ordinalDirection}}
            {{location.nearbyGPSCoordinate}}
            {{location.timeZone}}
            {{animal.dog}}
            {{animal.cat}}
            {{animal.snake}}
            {{animal.bear}}
            {{animal.lion}}
            {{animal.cetacean}}
            {{animal.horse}}
            {{animal.bird}}
            {{animal.cow}}
            {{animal.fish}}
            {{animal.crocodilia}}
            {{animal.insect}}
            {{animal.rabbit}}
            {{animal.type}}
            {{commerce.department}}
            {{commerce.productName}}
            {{commerce.price}}
            {{commerce.productAdjective}}
            {{commerce.productMaterial}}
            {{commerce.product}}
            {{commerce.productDescription}}
            {{company.name}}
            {{company.catchPhrase}}
            {{company.buzzPhrase}}
            {{company.catchPhraseAdjective}}
            {{company.catchPhraseDescriptor}}
            {{company.catchPhraseNoun}}
            {{company.buzzAdjective}}
            {{company.buzzVerb}}
            {{company.buzzNoun}}
            {{database.column}}
            {{database.type}}
            {{database.collation}}
            {{database.engine}}
            {{date.past}}
            {{date.future}}
            {{date.recent}}
            {{date.soon}}
            {{date.month}}
            {{date.weekday}}
            {{finance.accountNumber}}
            {{finance.accountName}}
            {{finance.routingNumber}}
            {{finance.maskedNumber}}
            {{finance.amount}}
            {{finance.transactionType}}
            {{finance.currencyCode}}
            {{finance.currencyName}}
            {{finance.currencySymbol}}
            {{finance.bitcoinAddress}}
            {{finance.litecoinAddress}}
            {{finance.creditCardNumber}}
            {{finance.creditCardCVV}}
            {{finance.ethereumAddress}}
            {{finance.iban}}
            {{finance.bic}}
            {{finance.transactionDescription}}
            {{git.branch}}
            {{git.commitEntry}}
            {{git.commitMessage}}
            {{git.commitSha}}
            {{hacker.abbreviation}}
            {{hacker.adjective}}
            {{hacker.noun}}
            {{hacker.verb}}
            {{hacker.ingverb}}
            {{hacker.phrase}}
            {{image.avatar}}
            {{internet.email}}
            {{internet.exampleEmail}}
            {{internet.username}}
            {{internet.protocol}}
            {{internet.httpMethod}}
            {{internet.url}}
            {{internet.domainName}}
            {{internet.domainSuffix}}
            {{internet.domainWord}}
            {{internet.ip}}
            {{internet.ipv6}}
            {{internet.port}}
            {{internet.userAgent}}
            {{internet.color}}
            {{internet.mac}}
            {{internet.password}}
            {{lorem.word}}
            {{lorem.words}}
            {{lorem.sentence}}
            {{lorem.slug}}
            {{lorem.sentences}}
            {{lorem.paragraph}}
            {{lorem.paragraphs}}
            {{lorem.text}}
            {{lorem.lines}}
            {{music.genre}}
            {{person.firstName}}
            {{person.lastName}}
            {{person.middleName}}
            {{person.fullName}}
            {{person.jobTitle}}
            {{person.gender}}
            {{person.prefix}}
            {{person.suffix}}
            {{person.jobDescriptor}}
            {{person.jobArea}}
            {{person.jobType}}
            {{phone.number}}
            {{phone.imei}}
            {{number.int}}
            {{number.float}}
            {{string.uuid}}
            {{string.alpha}}
            {{string.alphanumeric}}
            {{string.hexadecimal}}
            {{system.fileName}}
            {{system.commonFileName}}
            {{system.mimeType}}
            {{system.commonFileType}}
            {{system.commonFileExt}}
            {{system.fileType}}
            {{system.fileExt}}
            {{system.directoryPath}}
            {{system.filePath}}
            {{system.semver}}
            {{vehicle.vehicle}}
            {{vehicle.manufacturer}}
            {{vehicle.model}}
            {{vehicle.type}}
            {{vehicle.fuel}}
            {{vehicle.vin}}
            {{vehicle.color}}
            {{vehicle.vrm}}
            {{vehicle.bicycle}}
            ###`,
            []
        );
    });

    test("FakerJS syntax validation missing open", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            'lorem.words}}',
            [
                diagnostic(
                    position(2, 0),
                    position(2, 11),
                    "FakerJS expression 'lorem.words' must be opened with '{{'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing open 2", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words}}\n' +
            'lorem.words}}',
            [
                diagnostic(
                    position(2, 15),
                    position(3, 11),
                    "FakerJS expression '\nlorem.words' must be opened with '{{'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation unexpected token {{", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.w{{ords}}',
            [
                diagnostic(
                    position(2, 9),
                    position(2, 11),
                    "Unexpected token '{{' in expression 'lorem.w{{ords'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing close", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 13),
                    "FakerJS expression 'lorem.words' must be closed with '}}'",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });

    test("FakerJS syntax validation bad close", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words{{',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 15),
                    "FakerJS expression 'lorem.words{{' must be closed with '}}'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation missing close 2", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words\n' +
            '{{lorem.words}}',
            [
                diagnostic(
                    position(3, 0),
                    position(3, 2),
                    "Unexpected token '{{' in expression 'lorem.words\n{{lorem.words'",
                    DiagnosticSeverity.Error
                )
            ]
        );

    });

    test("FakerJS syntax validation with 0 part", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{}}',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 2),
                    "Required expression",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation with 1 part", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{abcd}}',
            [
                diagnostic(
                    position(2, 2),
                    position(2, 6),
                    "Missing '.' after 'abcd'",
                    DiagnosticSeverity.Error
                )
            ]
        );
    });

    test("FakerJS syntax validation with 3 parts", async () => {

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{abcd.efgh.ijkl}}',
            [
                diagnostic(
                    position(2, 12),
                    position(2, 16),
                    "Invalid content: 'ijkl'",
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
            '{{lorem.BAD_METHOD}}',
            [
                diagnostic(
                    position(2, 8),
                    position(2, 18),
                    "Invalid method: 'BAD_METHOD'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words()}}',
            [
                diagnostic(
                    position(2, 8),
                    position(2, 15),
                    "Invalid method: 'words()'",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words(}}',
            [
                diagnostic(
                    position(2, 8),
                    position(2, 14),
                    "Invalid method: 'words('",
                    DiagnosticSeverity.Error
                )
            ]
        );

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            '{{lorem.words(5)}}',
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

