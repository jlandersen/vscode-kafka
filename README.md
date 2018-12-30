# Kafka extension for Visual Studio Code
Work with Kafka directly in Visual Studio Code. Kafka clusters running version 0.11 or higher are supported.

Features:
- View brokers in cluster
- View topics

Planned features in no particular order:
- Administration (create, delete topics)
- View and update configs
- Consuming
- Producing
- Connect to multiple clusters

## Configuration
The extension connects to a Kafka cluster by providing one or more brokers in the `kafka.hosts` settings (user or workspace).
Example:

```json
{
    "kafka.host": "127.0.0.1:9092,127.0.0.1:9093"
}
```
