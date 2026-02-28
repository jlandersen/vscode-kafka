# Kafka + Schema Registry Test Cluster

This cluster starts Kafka with a local Confluent Schema Registry for development and manual validation.

## Start

```bash
cd test-clusters/schema-registry
docker-compose up -d
```

## Connection Settings

- Kafka bootstrap server: `localhost:9094`
- Authentication: none
- Schema Registry URL: `http://localhost:8081`

## Stop

```bash
docker-compose down -v
```
