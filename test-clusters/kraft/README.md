# KRaft Mode Kafka Cluster

This directory contains a Docker Compose configuration for running Kafka in **KRaft mode** (without Zookeeper).

## What is KRaft?

KRaft (Kafka Raft) is Kafka's new consensus protocol that replaces Apache Zookeeper for metadata management. Starting with Kafka 3.3, KRaft is production-ready and is the future of Kafka cluster management.

## Why This Test Cluster?

This cluster addresses the issue reported in [#248](https://github.com/jlandersen/vscode-kafka/issues/248), where the extension had problems consuming messages from KRaft-based clusters.

## Starting the Cluster

From the repository root:

```bash
cd test-clusters/kraft
docker-compose up -d
```

Or use the helper script:

```bash
./start-cluster.sh kraft
```

## Connection Details

- **Bootstrap Server:** `localhost:9092`
- **Authentication:** None
- **SSL:** No
- **Mode:** KRaft (no Zookeeper)

## Adding to VS Code

1. Click the **Add Cluster** button in the Kafka explorer
2. Enter the following details:
   - **Cluster Name:** KRaft Local
   - **Bootstrap Server:** `localhost:9092`
   - **Authentication:** None (leave blank)
   - **SSL:** Unchecked

## Testing Produce and Consume

Once connected, you can:

1. **Create a topic:** Right-click on "Topics" → "Create Topic"
2. **Produce messages:** Create a `.kafka` file:
   ```kafka
   PRODUCER
   topic: test-topic
   key: test-key
   
   {"message": "Hello from KRaft cluster!"}
   ###
   ```
3. **Consume messages:** Right-click on the topic → "Start Consumer"

## Verifying KRaft Mode

You can verify the cluster is running in KRaft mode by checking that:
- No Zookeeper container is running
- The Kafka logs show KRaft-related messages

```bash
docker logs kafka-kraft | grep -i kraft
```

## Troubleshooting

### Cluster won't start

If the cluster fails to start, try removing the volumes:

```bash
docker-compose down -v
docker-compose up -d
```

### Connection refused

Make sure port 9092 is not in use by another service:

```bash
lsof -i :9092
```

### Check cluster health

```bash
docker-compose ps
docker logs kafka-kraft
```

## Stopping the Cluster

```bash
cd test-clusters/kraft
docker-compose down
```

Or use the helper script:

```bash
./stop-cluster.sh kraft
```

To also remove volumes:

```bash
docker-compose down -v
```

## Differences from Zookeeper Mode

Key differences in KRaft mode:
- No Zookeeper dependency
- Faster metadata operations
- Simpler architecture
- Better scalability for large clusters
- Some admin operations may behave slightly differently

## Related Resources

- [KRaft Documentation](https://kafka.apache.org/documentation/#kraft)
- [GitHub Issue #248](https://github.com/jlandersen/vscode-kafka/issues/248)
- [Apache Kafka KRaft Overview](https://developer.confluent.io/learn/kraft/)
