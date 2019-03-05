# Kafka extension for Visual Studio Code
Work with Kafka directly in Visual Studio Code. Kafka clusters running version 0.11 or higher are supported.

Features:
- View brokers in cluster
- View topics
- View configs
- Create topic
- Producing
- Consuming

Planned features in no particular order:
- More administration features (delete topics)
- Update configs
- Connect to multiple clusters

## Screenshots
![Screenshot-1](assets/screen-1.png)

![Screenshot-2](assets/screen-2.png)

![Screenshot-3](assets/screen-3.png)

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

## Consuming
Consuming topics can be done by right clicking a topic in the explorer or from the command palette.  Some things to note about consuming:

* UTF-8 encoded keys and values only. If data is encoded differently, it will not be pretty.
* One consumer group is created per topic (may change in the future to just have one for the extension).

Consumers are based on virtual documents, available in the VS Code extension API. A consumer will keep running even if you close the document in the editor. You should make sure to close the consumer explicitly, either via the command palette, the status bar element or the start/stop action button as well. The VS Code API does not support detecting if a virtual document is closed immediately. Instead, the underlying virtual document is automatically closed after two minutes if the document is closed in the editor.

You can configure start offset for new consumers in settings (earliest, latest).
