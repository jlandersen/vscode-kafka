import { getDocumentationPageUri } from "../../docs/markdownPreviewProvider";

export class Model {

    private cache = new Map<string, ModelDefinition>();

    constructor(public readonly definitions: ModelDefinition[]) {
        definitions.forEach(definition => {
            this.cache.set(definition.name, definition);
        });
    }
    public getDefinition(name: string): ModelDefinition | undefined {
        return this.cache.get(name);
    }

    public hasDefinition(name: string): boolean {
        return this.cache.has(name);
    }

    public hasDefinitionEnum(name: string, value: string): boolean {
        return this.getDefinitionEnum(name, value) !== undefined;
    }

    public getDefinitionEnum(name: string, value?: string): ModelDefinition | undefined {
        if (!value) {
            return;
        }
        const definition = this.getDefinition(name);
        if (!definition) {
            return undefined;
        }
        if (definition.enum) {
            for (const item of definition.enum) {
                if (item.name === value) {
                    return item;
                }
            }
        }
        return undefined;
    }
}

export interface ModelDefinition {
    name: string;
    description: string;
    enum?: ModelDefinition[];
}

const consumerProperties = [
    {
        name: "topic",
        description: "The topic id *[required]*"
    },
    {
        name: "from",
        description: "The offset from which the consumer group will start consuming messages from. Possible values are: `earliest`, `latest`, or an integer value. *[optional]*.",
        enum: [
            {
                name: "earliest"
            },
            {
                name: "latest"
            },
            {
                name: "0"
            }
        ]
    },
    {
        name: "key-format",
        description: `[Deserializer](${getDocumentationPageUri('Consuming', 'deserializer')}) to use for the key *[optional]*.`,
        enum: [
            {
                name: "none",
                description: "No deserializer (ignores content)"
            },
            {
                name: "string",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java)."
            },
            {
                name: "double",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleDeserializer.java)."
            },
            {
                name: "float",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatDeserializer.java)."
            },
            {
                name: "integer",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerDeserializer.java)."
            },
            {
                name: "long",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.LongDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongDeserializer.java)."
            },
            {
                name: "short",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortDeserializer.java)."
            }
        ]
    },
    {
        name: "value-format",
        description: `[Deserializer](${getDocumentationPageUri('Consuming', 'deserializer')}) to use for the value *[optional]*.`,
        enum: [
            {
                name: "none",
                description: "No deserializer (ignores content)"
            },
            {
                name: "string",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java)."
            },
            {
                name: "double",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleDeserializer.java)."
            },
            {
                name: "float",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatDeserializer.java)."
            },
            {
                name: "integer",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerDeserializer.java)."
            },
            {
                name: "long",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.LongDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongDeserializer.java)."
            },
            {
                name: "short",
                description: "Similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortDeserializer.java)."
            }
        ]
    },
    {
        name: "partitions",
        description: "the partition number(s), or a partitions range, or a combinaison of partitions ranges *[optional]*. eg:\n* 0\n* 0,1,2\n* 0-2\n* 0,2-3",
        enum: [
            {
                name: "0"
            }
        ]
    }
] as ModelDefinition[];
export const consumerModel = new Model(consumerProperties);

const producerProperties = [
    {
        name: "topic",
        description: "The topic id *[required]*"
    },
    {
        name: "key",
        description: "The key *[optional]*."
    },
    {
        name: "headers",
        description: "The headers of message *[optional]*."
    },
    {
        name: "key-format",
        description: `[Serializer](${getDocumentationPageUri('Producing', 'serializer')}) to use for the key *[optional]*.`,
        enum: [
            {
                name: "string",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java)."
            },
            {
                name: "double",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleSerializer.java)."
            },
            {
                name: "float",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatSerializer.java)."
            },
            {
                name: "integer",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerSerializer.java)."
            },
            {
                name: "long",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.LongSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongSerializer.java)."
            },
            {
                name: "short",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortSerializer.java)."
            }
        ]
    },
    {
        name: "value-format",
        description: `[Serializer](${getDocumentationPageUri('Producing', 'serializer')}) to use for the value *[optional]*.`,
        enum: [
            {
                name: "string",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java)."
            },
            {
                name: "double",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleSerializer.java)."
            },
            {
                name: "float",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatSerializer.java)."
            },
            {
                name: "integer",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerSerializer.java)."
            },
            {
                name: "long",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.LongSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongSerializer.java)."
            },
            {
                name: "short",
                description: "Similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortSerializer.java)."
            }
        ]
    },
    {
        name: "every",
        description: "Produce messages repeatedly at a given interval. Supports time units: `s` (seconds), `m` (minutes), `h` (hours). Examples: `3s`, `5m`, `1h` *[optional]*.",
        enum: [
            {
                name: "3s"
            },
            {
                name: "5m"
            },
            {
                name: "1h"
            }
        ]
    }
] as ModelDefinition[];

export const producerModel = new Model(producerProperties);

const fakerjsAPI = [
    // airline
    { name: "airline.aircraftType" },
    { name: "airline.airline" },
    { name: "airline.airplane" },
    { name: "airline.airport" },
    { name: "airline.flightNumber" },
    { name: "airline.recordLocator" },
    { name: "airline.seat" },
    // animal
    { name: "animal.bear" },
    { name: "animal.bird" },
    { name: "animal.cat" },
    { name: "animal.cetacean" },
    { name: "animal.cow" },
    { name: "animal.crocodilia" },
    { name: "animal.dog" },
    { name: "animal.fish" },
    { name: "animal.horse" },
    { name: "animal.insect" },
    { name: "animal.lion" },
    { name: "animal.petName" },
    { name: "animal.rabbit" },
    { name: "animal.rodent" },
    { name: "animal.snake" },
    { name: "animal.type" },
    // book
    { name: "book.author" },
    { name: "book.format" },
    { name: "book.genre" },
    { name: "book.publisher" },
    { name: "book.series" },
    { name: "book.title" },
    // color
    { name: "color.cmyk" },
    { name: "color.colorByCSSColorSpace" },
    { name: "color.cssSupportedFunction" },
    { name: "color.cssSupportedSpace" },
    { name: "color.hsl" },
    { name: "color.human" },
    { name: "color.hwb" },
    { name: "color.lab" },
    { name: "color.lch" },
    { name: "color.rgb" },
    { name: "color.space" },
    // commerce
    { name: "commerce.department" },
    { name: "commerce.isbn" },
    { name: "commerce.price" },
    { name: "commerce.product" },
    { name: "commerce.productAdjective" },
    { name: "commerce.productDescription" },
    { name: "commerce.productMaterial" },
    { name: "commerce.productName" },
    // company
    { name: "company.buzzAdjective" },
    { name: "company.buzzNoun" },
    { name: "company.buzzPhrase" },
    { name: "company.buzzVerb" },
    { name: "company.catchPhrase" },
    { name: "company.catchPhraseAdjective" },
    { name: "company.catchPhraseDescriptor" },
    { name: "company.catchPhraseNoun" },
    { name: "company.name" },
    // database
    { name: "database.collation" },
    { name: "database.column" },
    { name: "database.engine" },
    { name: "database.mongodbObjectId" },
    { name: "database.type" },
    // date
    { name: "date.anytime" },
    { name: "date.birthdate" },
    { name: "date.future" },
    { name: "date.month" },
    { name: "date.past" },
    { name: "date.recent" },
    { name: "date.soon" },
    { name: "date.weekday" },
    // finance
    { name: "finance.accountName" },
    { name: "finance.accountNumber" },
    { name: "finance.amount" },
    { name: "finance.bic" },
    { name: "finance.bitcoinAddress" },
    { name: "finance.creditCardCVV" },
    { name: "finance.creditCardIssuer" },
    { name: "finance.creditCardNumber" },
    { name: "finance.currency" },
    { name: "finance.currencyCode" },
    { name: "finance.currencyName" },
    { name: "finance.currencySymbol" },
    { name: "finance.ethereumAddress" },
    { name: "finance.iban" },
    { name: "finance.litecoinAddress" },
    { name: "finance.maskedNumber" },
    { name: "finance.pin" },
    { name: "finance.routingNumber" },
    { name: "finance.transactionDescription" },
    { name: "finance.transactionType" },
    // food
    { name: "food.adjective" },
    { name: "food.description" },
    { name: "food.dish" },
    { name: "food.ethnicCategory" },
    { name: "food.fruit" },
    { name: "food.ingredient" },
    { name: "food.meat" },
    { name: "food.spice" },
    { name: "food.vegetable" },
    // git
    { name: "git.branch" },
    { name: "git.commitDate" },
    { name: "git.commitEntry" },
    { name: "git.commitMessage" },
    { name: "git.commitSha" },
    // hacker
    { name: "hacker.abbreviation" },
    { name: "hacker.adjective" },
    { name: "hacker.ingverb" },
    { name: "hacker.noun" },
    { name: "hacker.phrase" },
    { name: "hacker.verb" },
    // image
    { name: "image.avatar" },
    { name: "image.avatarGitHub" },
    { name: "image.avatarLegacy" },
    { name: "image.dataUri" },
    { name: "image.url" },
    { name: "image.urlLoremFlickr" },
    { name: "image.urlPicsumPhotos" },
    { name: "image.urlPlaceholder" },
    // internet
    { name: "internet.color" },
    { name: "internet.displayName" },
    { name: "internet.domainName" },
    { name: "internet.domainSuffix" },
    { name: "internet.domainWord" },
    { name: "internet.email" },
    { name: "internet.emoji" },
    { name: "internet.exampleEmail" },
    { name: "internet.httpMethod" },
    { name: "internet.httpStatusCode" },
    { name: "internet.ip" },
    { name: "internet.ipv4" },
    { name: "internet.ipv6" },
    { name: "internet.jwt" },
    { name: "internet.mac" },
    { name: "internet.password" },
    { name: "internet.port" },
    { name: "internet.protocol" },
    { name: "internet.url" },
    { name: "internet.userAgent" },
    { name: "internet.username" },
    // location (formerly address)
    { name: "location.buildingNumber" },
    { name: "location.cardinalDirection" },
    { name: "location.city" },
    { name: "location.continent" },
    { name: "location.country" },
    { name: "location.countryCode" },
    { name: "location.county" },
    { name: "location.direction" },
    { name: "location.latitude" },
    { name: "location.longitude" },
    { name: "location.nearbyGPSCoordinate" },
    { name: "location.ordinalDirection" },
    { name: "location.secondaryAddress" },
    { name: "location.state" },
    { name: "location.street" },
    { name: "location.streetAddress" },
    { name: "location.timeZone" },
    { name: "location.zipCode" },
    // lorem
    { name: "lorem.lines" },
    { name: "lorem.paragraph" },
    { name: "lorem.paragraphs" },
    { name: "lorem.sentence" },
    { name: "lorem.sentences" },
    { name: "lorem.slug" },
    { name: "lorem.text" },
    { name: "lorem.word" },
    { name: "lorem.words" },
    // music
    { name: "music.album" },
    { name: "music.artist" },
    { name: "music.genre" },
    { name: "music.songName" },
    // number
    { name: "number.bigInt" },
    { name: "number.binary" },
    { name: "number.float" },
    { name: "number.hex" },
    { name: "number.int" },
    { name: "number.octal" },
    { name: "number.romanNumeral" },
    // person (formerly name)
    { name: "person.bio" },
    { name: "person.firstName" },
    { name: "person.fullName" },
    { name: "person.gender" },
    { name: "person.jobArea" },
    { name: "person.jobDescriptor" },
    { name: "person.jobTitle" },
    { name: "person.jobType" },
    { name: "person.lastName" },
    { name: "person.middleName" },
    { name: "person.prefix" },
    { name: "person.sex" },
    { name: "person.sexType" },
    { name: "person.suffix" },
    { name: "person.zodiacSign" },
    // phone
    { name: "phone.imei" },
    { name: "phone.number" },
    // science
    { name: "science.chemicalElement" },
    { name: "science.unit" },
    // string
    { name: "string.alpha" },
    { name: "string.alphanumeric" },
    { name: "string.binary" },
    { name: "string.fromCharacters" },
    { name: "string.hexadecimal" },
    { name: "string.nanoid" },
    { name: "string.numeric" },
    { name: "string.octal" },
    { name: "string.sample" },
    { name: "string.symbol" },
    { name: "string.ulid" },
    { name: "string.uuid" },
    // system
    { name: "system.commonFileExt" },
    { name: "system.commonFileName" },
    { name: "system.commonFileType" },
    { name: "system.cron" },
    { name: "system.directoryPath" },
    { name: "system.fileExt" },
    { name: "system.fileName" },
    { name: "system.filePath" },
    { name: "system.fileType" },
    { name: "system.mimeType" },
    { name: "system.networkInterface" },
    { name: "system.semver" },
    // vehicle
    { name: "vehicle.bicycle" },
    { name: "vehicle.color" },
    { name: "vehicle.fuel" },
    { name: "vehicle.manufacturer" },
    { name: "vehicle.model" },
    { name: "vehicle.type" },
    { name: "vehicle.vehicle" },
    { name: "vehicle.vin" },
    { name: "vehicle.vrm" },
    // word
    { name: "word.adjective" },
    { name: "word.adverb" },
    { name: "word.conjunction" },
    { name: "word.interjection" },
    { name: "word.noun" },
    { name: "word.preposition" },
    { name: "word.sample" },
    { name: "word.verb" },
    { name: "word.words" },
    // Custom helpers (prefixed with $ to distinguish from faker methods)
    { name: "$timestamp", description: "Current timestamp in milliseconds" },
    { name: "$date.now", description: "Current timestamp in milliseconds (alias for $timestamp)" },
    { name: "$date.iso", description: "Current date in ISO 8601 format" },
    { name: "$date.unix", description: "Current Unix timestamp in seconds" }
] as ModelDefinition[];

export interface PartModelProvider {
    getPart(name: string): PartModelProvider | undefined;
}

class PartModel implements PartModelProvider {

    private cache = new Map<string, PartModelProvider>();

    getPart(name: string): PartModelProvider | undefined {
        return this.cache.get(name);
    }

    getOrCreate(name: string): PartModelProvider {
        let part = this.getPart(name);
        if (!part) {
            part = new PartModel();
            this.cache.set(name, part);
        }
        return part;
    }
}

class FakerJSModel extends Model implements PartModelProvider {

    private root = new PartModel();
    constructor(definitions: ModelDefinition[]) {
        super(definitions);
        definitions.forEach(definition => {
            const parts = definition.name.split('.');
            let partModel = this.root;
            parts.forEach(part => {
                partModel = <PartModel>partModel.getOrCreate(part);
            });
        });
    }

    getPart(name: string): PartModelProvider | undefined {
        return this.root.getPart(name);
    }
}

export const fakerjsAPIModel = new FakerJSModel(fakerjsAPI);
