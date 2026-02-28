# Explorer

The Kafka explorer shows configured clusters with their topics, brokers, consumers and configurations.

![Kafka Explorer](assets/kafka-explorer.png)

## Cluster Item

In the Kafka explorer, right-click on a cluster to access several options.

If a cluster has a linked Schema Registry, the cluster tree also shows:

`Schema Registries -> <Registry Name> -> Subjects -> Versions`

### Select Cluster

Before using a [.kafka file](KafkaFile.md#kafkafile), a cluster must be selected, you can use the `Select cluster` menu item:

![Select cluster](assets/kafka-explorer-select-cluster.png)

## Schema Registry Connections

Schema Registry connections are configured separately from clusters and can be reused across clusters.

- Define registry connections in `kafka.schemaRegistries`.
- Link a cluster to a registry by setting `schemaRegistryId` in the cluster config.
- Credentials are stored in secure storage, not plain settings.

Example:

```json
"kafka.schemaRegistries": [
    {
        "id": "local-registry",
        "name": "Local Registry",
        "connection": {
            "url": "http://localhost:8081",
            "namingStrategy": "TopicNameStrategy",
            "auth": {
                "username": "user"
            }
        }
    }
],
"kafka.clusters": [
    {
        "id": "local-cluster",
        "name": "Local Cluster",
        "bootstrap": "localhost:9092",
        "schemaRegistryId": "local-registry"
    }
]
```

## Actions

### Copy Label

You can copy the label of any tree node in the clipboard with `Ctrl+C` (`Cmd+C` on Mac) or  via the `Copy Label` contextual menu:

![Copy Label](assets/kafka-explorer-copylabel.png)

### Delete

You can delete clusters, topics and consumer groups with the `Delete` (`Cmd+Delete` on Mac) key, the `Trashcan` icon or `Delete` contextual menu:

![Delete Consumer Group](assets/kafka-explorer-delete-consumergroup.png)

Multiple delete is not supported for the moment. See [issue 107](https://github.com/jlandersen/vscode-kafka/issues/107).

To delete a consumer group, it first must be stopped, else the `Delete` action will report an error.

## Discover new cluster providers

You can search for extensions contributing cluster providers in the extension gallery, by clicking on the `Discover Cluster Providers` button (also available via the command palette):

![Discover Cluster Providers](assets/kafka-explorer-discover-providers.png)

Those extensions must have the `kafka-provider` keyword in their `package.json`, eg.
```json
"keywords": [
		"kafka-provider"
],
```

## Preferences

### `kafka.explorer.topics.sort`

Choose sorting for topics in explorer.

### `kafka.explorer.topics.filter`

Glob patterns filtering topics out of the Kafka explorer. `*` matches any string, `?` matches a single character.

### `kafka.explorer.consumers.filter`

Glob patterns filtering consumer groups out of the Kafka explorer. `*` matches any string, `?` matches a single character.
