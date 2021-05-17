# Producing messages

Define simple producers in a [.kafka](KafkaFile.md#kafkafile) file, using the following format:

```
PRODUCER keyed-message
topic: my-topic
key: mykeyq
record content

###

PRODUCER non-keyed-json-message
topic: json-events
{
    "type": "my_test_event"
}
```

To produce a single record, click on the `Produce record` link above the `PRODUCER` line; to produce 10 records, click on `Produce record x 10`.

![Producers](assets/kafka-file-producers.png)

The log about produced messages is printed in the `Kafka Producer Log` Output view.

The `PRODUCER` block defines:

 * `keyed message` which is declared after PRODUCER *[optional]*.
 * `key`: the key *[optional]*.
 * `key-format` : [serializer](#Serializer) to use for the key *[optional]*.
 * `value-format` : [serializer](#Serializer) to use for the value *[optional]*.
 
 * the rest of the content is the value until `###`.

### Serializer

A PRODUCER can serialize `key/value` by declaring the proper serializer with `key-format/value-format` property. See [Basic serializer](Serialization.md#basic-serializer), [Avro serializer](Serialization.md#avro-serializer) for more informations.

### Completion

Completion snippets can help you quickly bootstrap new `PRODUCER` blocks:

![Producer snippets](assets/kafka-file-producer-snippet.png)

Completion is available for 

 * property name:

![Property name completion](assets/kafka-file-producer-property-name-completion.png)

 * property value:

![Property value completion](assets/kafka-file-producer-property-value-completion.png)

 * string encoding:
 
![String encoding completion](assets/kafka-file-producer-string-encoding-completion.png)

 * randomized content (see following section):
 
![FakerJS completion](assets/kafka-file-producer-fakerjs-completion.png)

 * topic:
 
![Topic completion](assets/kafka-file-producer-topic-completion.png)

### Validation

Validation will help you write valid producers in .kafka files.

 * here is an example of value validation:

![Empty value](assets/kafka-file-producer-empty-value-validation.png)

 * here is an example with FakerJS validation:
 
![FakerJS validation](assets/kafka-file-producer-fakerjs-validation.png)

 * Existing topic validation is done only when cluster is `connected`. If the topic doesn't already exist, an error will be reported if the broker configuration is accessible and `auto.create.topics.enable=false`.

![Existing topic validation](assets/kafka-file-producer-topic-validation.png)
 
### Hover
 
Hover for properties documentation and topic informations is available in .kafka files.

Here is an example of hover on topic:

![Existing topic validation](assets/kafka-file-producer-topic-hover.png)

## Randomized content

Record content can be randomized by injecting mustache-like placeholders of [faker.js properties](https://github.com/Marak/faker.js#api-methods), like ``{{name.lastName}}`` or ``{{random.number}}``. Some randomized properties can be localized via the `kafka.producers.fakerjs.locale` setting.

The same seed is used for randomizing the key and the value, so the same randomized content can be injected in both places, as long as the same field is injected first in the message body.

For instance:

```
--- Produce random messages with built-in faker.js support
--- Message body simply needs to follow the mustache template syntax
--- See available fake data at https://github.com/marak/Faker.js/#api-methods

PRODUCER keyed-message
topic: fakerjs-topic
key: dept-{{random.number(5)}}
{
    "dept":"{{random.number(5)}}",
    "id": "{{random.uuid}}",
    "first_name": "{{name.firstName}}",
    "last_name": "{{name.lastName}}",
    "email": "{{internet.email}}",
    "country": "{{address.country}}"
}
```

![Producer - randomized](assets/kafka-file-producer-randomized.png)

### `kafka.producers.fakerjs.enabled`

Enable injection of [faker.js](https://github.com/marak/Faker.js/#api-methods)-randomized data in record templates, using the mustache syntax.

### `kafka.producers.fakerjs.locale`

[experimental] The locale used to generate [faker.js](https://github.com/marak/Faker.js/#api-methods)-randomized data in record templates.