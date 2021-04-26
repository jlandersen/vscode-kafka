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

        await assertDiagnostics(
            'PRODUCER\n' +
            'topic:abcd\n' +
            `
            {{address.zipCode}}
            {{address.zipCodeByState}}
            {{address.city}}
            {{address.cityPrefix}}
            {{address.citySuffix}}
            {{address.cityName}}
            {{address.streetName}}
            {{address.streetAddress}}
            {{address.streetSuffix}}
            {{address.streetPrefix}}
            {{address.secondaryAddress}}
            {{address.county}}
            {{address.country}}
            {{address.countryCode}}
            {{address.state}}
            {{address.stateAbbr}}
            {{address.latitude}}
            {{address.longitude}}
            {{address.direction}}
            {{address.cardinalDirection}}
            {{address.ordinalDirection}}
            {{address.nearbyGPSCoordinate}}
            {{address.timeZone}}
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
            {{commerce.color}}
            {{commerce.department}}
            {{commerce.productName}}
            {{commerce.price}}
            {{commerce.productAdjective}}
            {{commerce.productMaterial}}
            {{commerce.product}}
            {{commerce.productDescription}}
            {{company.suffixes}}
            {{company.companyName}}
            {{company.companySuffix}}
            {{company.catchPhrase}}
            {{company.bs}}
            {{company.catchPhraseAdjective}}
            {{company.catchPhraseDescriptor}}
            {{company.catchPhraseNoun}}
            {{company.bsAdjective}}
            {{company.bsBuzz}}
            {{company.bsNoun}}
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
            {{finance.account}}
            {{finance.accountName}}
            {{finance.routingNumber}}
            {{finance.mask}}
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
            {{git.shortSha}}
            {{hacker.abbreviation}}
            {{hacker.adjective}}
            {{hacker.noun}}
            {{hacker.verb}}
            {{hacker.ingverb}}
            {{hacker.phrase}}
            {{internet.avatar}}
            {{internet.email}}
            {{internet.exampleEmail}}
            {{internet.userName}}
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
            {{mersenne.rand}}
            {{name.firstName}}
            {{name.lastName}}
            {{name.middleName}}
            {{name.findName}}
            {{name.jobTitle}}
            {{name.gender}}
            {{name.prefix}}
            {{name.suffix}}
            {{name.title}}
            {{name.jobDescriptor}}
            {{name.jobArea}}
            {{name.jobType}}
            {{phone.phoneNumber}}
            {{phone.phoneNumberFormat}}
            {{phone.phoneFormats}}
            {{random.number}}
            {{random.float}}
            {{random.uuid}}
            {{random.boolean}}
            {{random.word}}
            {{random.words}}
            {{random.locale}}
            {{random.alpha}}
            {{random.alphaNumeric}}
            {{random.hexaDecimal}}
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
            {{time.recent}}
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

