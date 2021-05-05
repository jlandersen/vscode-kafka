# Serialization

 * A PRODUCER can serialize `key/value` by declaring the proper serializer with `key-format/value-format` property.
 * A CONSUMER can deserialize `key/value` by declaring the proper deserializer for `key-format/value-format` property.
 
## Basic serialization

### Basic serializer

The serializers can have the following value:

   * `string`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.StringSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringSerializer.java). By default it supports `UTF-8` encoding, but you can specify the encoding as parameter like this `string(base64)`. The valid encoding values are defined in [Node.js' buffers and character encodings](https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings).
   * `double`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleSerializer.java).
   * `float`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatSerializer.java).
   * `integer`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerSerializer.java).
   * `long`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.LongSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongSerializer.java).
   * `short`: similar serializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortSerializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortSerializer.java). 
 
### Basic deserializer

The deserializers can have the following value:

   * `none`: no deserializer (ignores content).
   * `string`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.StringDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/StringDeserializer.java). By default it supports `UTF-8` encoding, but you can specify the encoding as parameter like this `string(base64)`. The valid encoding values are defined in [Node.js' buffers and character encodings](https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings).
   * `double`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.DoubleDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/DoubleDeserializer.java).
   * `float`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.FloatDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/FloatDeserializer.java).
   * `integer`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.IntegerDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/IntegerDeserializer.java).
   * `long`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.LongDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/LongDeserializer.java).
   * `short`: similar deserializer to the Kafka Java client [org.apache.kafka.common.serialization.ShortDeserializer](https://github.com/apache/kafka/blob/master/clients/src/main/java/org/apache/kafka/common/serialization/ShortDeserializer.java). 

## Avro serialization

Serialization can be done too with [Apache Avro Schema](http://avro.apache.org/docs/current/spec.html) with a local Avro Schema `*.avsc`

For instance you can create an [Apache Avro](http://avro.apache.org/docs/current/spec.html) Schema `animals.avsc`:


```json
{
    "type": "record",
    "fields": [
        {
            "name": "kind",
            "type": {
                "name": "animals_type",
                "type": "enum",
                "symbols": [
                    "CAT",
                    "DOG"
                ]
            }
        },
        {
            "name": "name",
            "type": "string"
        }
    ]
}
```

and bind it with `avro(path/of/animals.avsc)` in `key-format` / `value-format`. Path is resolved following those strategies:

 * `file:///` a given file path (ex : `avro(file:///C:/path/of/animals.avsc)`.
 * `/` relative path to the kafka file (ex : `avro(/path/of/animals.avsc)`.
 * otherwise relative path to the workspace folder of kafka file (ex : `avro(path/of/animals.avsc)`.

### Avro Schema support

`*.avsc` files benefit with completion, validation for Avro specification.

### Avro serializer

You can serialize value of produced message by using the Avro schema `animals.avsc` like this:

```
PRODUCER json-output
topic: topic_name
value-format: avro(animals.avsc)
{"kind": "CAT", "name": "Albert"}

###
```

### Avro deserializer

You can deserialize value of consummed message by using the Avro schema `animals.avsc` like this:

```
CONSUMER consumer-group-id
topic: topic_name
from: earliest
value-format: avro(animals.avsc)
```