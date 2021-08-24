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
    }
] as ModelDefinition[];

export const producerModel = new Model(producerProperties);

const fakerjsAPI = [
    { name: "address.zipCode" },
    { name: "address.zipCodeByState" },
    { name: "address.city" },
    { name: "address.cityPrefix" },
    { name: "address.citySuffix" },
    { name: "address.cityName" },
    { name: "address.streetName" },
    { name: "address.streetAddress" },
    { name: "address.streetSuffix" },
    { name: "address.streetPrefix" },
    { name: "address.secondaryAddress" },
    { name: "address.county" },
    { name: "address.country" },
    { name: "address.countryCode" },
    { name: "address.state" },
    { name: "address.stateAbbr" },
    { name: "address.latitude" },
    { name: "address.longitude" },
    { name: "address.direction" },
    { name: "address.cardinalDirection" },
    { name: "address.ordinalDirection" },
    { name: "address.nearbyGPSCoordinate" },
    { name: "address.timeZone" },
    { name: "animal.dog" },
    { name: "animal.cat" },
    { name: "animal.snake" },
    { name: "animal.bear" },
    { name: "animal.lion" },
    { name: "animal.cetacean" },
    { name: "animal.horse" },
    { name: "animal.bird" },
    { name: "animal.cow" },
    { name: "animal.fish" },
    { name: "animal.crocodilia" },
    { name: "animal.insect" },
    { name: "animal.rabbit" },
    { name: "animal.type" },
    { name: "commerce.color" },
    { name: "commerce.department" },
    { name: "commerce.productName" },
    { name: "commerce.price" },
    { name: "commerce.productAdjective" },
    { name: "commerce.productMaterial" },
    { name: "commerce.product" },
    { name: "commerce.productDescription" },
    { name: "company.suffixes" },
    { name: "company.companyName" },
    { name: "company.companySuffix" },
    { name: "company.catchPhrase" },
    { name: "company.bs" },
    { name: "company.catchPhraseAdjective" },
    { name: "company.catchPhraseDescriptor" },
    { name: "company.catchPhraseNoun" },
    { name: "company.bsAdjective" },
    { name: "company.bsBuzz" },
    { name: "company.bsNoun" },
    { name: "database.column" },
    { name: "database.type" },
    { name: "database.collation" },
    { name: "database.engine" },
    { name: "date.past" },
    { name: "date.future" },
    { name: "date.recent" },
    { name: "date.soon" },
    { name: "date.month" },
    { name: "date.weekday" },
    { name: "finance.account" },
    { name: "finance.accountName" },
    { name: "finance.routingNumber" },
    { name: "finance.mask" },
    { name: "finance.amount" },
    { name: "finance.transactionType" },
    { name: "finance.currencyCode" },
    { name: "finance.currencyName" },
    { name: "finance.currencySymbol" },
    { name: "finance.bitcoinAddress" },
    { name: "finance.litecoinAddress" },
    { name: "finance.creditCardNumber" },
    { name: "finance.creditCardCVV" },
    { name: "finance.ethereumAddress" },
    { name: "finance.iban" },
    { name: "finance.bic" },
    { name: "finance.transactionDescription" },
    { name: "git.branch" },
    { name: "git.commitEntry" },
    { name: "git.commitMessage" },
    { name: "git.commitSha" },
    { name: "git.shortSha" },
    { name: "hacker.abbreviation" },
    { name: "hacker.adjective" },
    { name: "hacker.noun" },
    { name: "hacker.verb" },
    { name: "hacker.ingverb" },
    { name: "hacker.phrase" },
    { name: "internet.avatar" },
    { name: "internet.email" },
    { name: "internet.exampleEmail" },
    { name: "internet.userName" },
    { name: "internet.protocol" },
    { name: "internet.httpMethod" },
    { name: "internet.url" },
    { name: "internet.domainName" },
    { name: "internet.domainSuffix" },
    { name: "internet.domainWord" },
    { name: "internet.ip" },
    { name: "internet.ipv6" },
    { name: "internet.port" },
    { name: "internet.userAgent" },
    { name: "internet.color" },
    { name: "internet.mac" },
    { name: "internet.password" },
    { name: "lorem.word" },
    { name: "lorem.words" },
    { name: "lorem.sentence" },
    { name: "lorem.slug" },
    { name: "lorem.sentences" },
    { name: "lorem.paragraph" },
    { name: "lorem.paragraphs" },
    { name: "lorem.text" },
    { name: "lorem.lines" },
    { name: "mersenne.rand" },
    { name: "music.genre" },
    { name: "name.firstName" },
    { name: "name.lastName" },
    { name: "name.middleName" },
    { name: "name.findName" },
    { name: "name.jobTitle" },
    { name: "name.gender" },
    { name: "name.prefix" },
    { name: "name.suffix" },
    { name: "name.title" },
    { name: "name.jobDescriptor" },
    { name: "name.jobArea" },
    { name: "name.jobType" },
    { name: "phone.phoneNumber" },
    { name: "phone.phoneNumberFormat" },
    { name: "phone.phoneFormats" },
    { name: "random.number" },
    { name: "random.float" },
    { name: "random.uuid" },
    { name: "random.boolean" },
    { name: "random.word" },
    { name: "random.words" },
    { name: "random.locale" },
    { name: "random.alpha" },
    { name: "random.alphaNumeric" },
    { name: "random.hexaDecimal" },
    { name: "system.fileName" },
    { name: "system.commonFileName" },
    { name: "system.mimeType" },
    { name: "system.commonFileType" },
    { name: "system.commonFileExt" },
    { name: "system.fileType" },
    { name: "system.fileExt" },
    { name: "system.directoryPath" },
    { name: "system.filePath" },
    { name: "system.semver" },
    { name: "time.recent" },
    { name: "vehicle.vehicle" },
    { name: "vehicle.manufacturer" },
    { name: "vehicle.model" },
    { name: "vehicle.type" },
    { name: "vehicle.fuel" },
    { name: "vehicle.vin" },
    { name: "vehicle.color" },
    { name: "vehicle.vrm" },
    { name: "vehicle.bicycle" }
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
