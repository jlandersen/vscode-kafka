# Kafka extension for Visual Studio Code
Work with Kafka directly in Visual Studio Code. Kafka clusters running version 0.11 or higher are supported.

Features:
- View brokers in cluster
- View topics
- View configs
- Create topic
- Producing

Planned features in no particular order:
- More administration features (delete topics)
- Update configs
- Consuming
- Connect to multiple clusters

## Screenshots
![Screenshot-1](assets/screen-1.png)

![Screenshot-2](assets/screen-2.png)

## Configuration
The extension connects to a Kafka cluster by providing one or more brokers in the `kafka.hosts` settings (user or workspace).
Example:

```json
{
    "kafka.hosts": "127.0.0.1:9092,127.0.0.1:9093"
}
```

## Producing
Producing can be done by creating a `.kafka` file. Write simple producers using the following format:

```json
PRODUCER keyed-message
topic: my-topic
key: mykey
record content

###

PRODUCER non-keyed-json-message
topic: json-events
{
    "type": "my_test_event"
}
```

Producers with a key will assign partition based on a hash of the key. If no key is provided a round robin assignment is used.
