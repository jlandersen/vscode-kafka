# Test Clusters for vscode-kafka

This directory contains Docker Compose configurations for testing the vscode-kafka extension with different Kafka authentication methods.

## Available Clusters

| Cluster | Port | Authentication | Description |
|---------|------|----------------|-------------|
| `plaintext` | 9092 | None | Simple Kafka cluster without authentication |
| `sasl-plain` | 9093 | SASL/PLAIN | Kafka with username/password authentication |
| `oauth` | 9092 | OAUTHBEARER | Kafka with OAuth 2.0 (includes Keycloak) |

> **Note:** The `plaintext` and `oauth` clusters both use port 9092, so only run one at a time.

## Quick Start

From the repository root:

```bash
# Start a specific cluster
./start-cluster.sh <cluster-name>

# Stop a specific cluster
./stop-cluster.sh <cluster-name>

# Stop all clusters
./stop-cluster.sh all
```

Or manually with Docker Compose:

```bash
# Start plaintext cluster
cd test-clusters/plaintext && docker-compose up -d

# Start SASL/PLAIN cluster
cd test-clusters/sasl-plain && docker-compose up -d

# Start OAuth cluster (includes Keycloak)
cd test-clusters/oauth && docker-compose up -d
```

## Connection Details

### Plaintext Cluster

- **Bootstrap Server:** `localhost:9092`
- **Authentication:** None
- **SSL:** No

### SASL/PLAIN Cluster

- **Bootstrap Server:** `localhost:9093`
- **Authentication:** SASL/PLAIN
- **Username:** `testuser`
- **Password:** `testpassword`
- **SSL:** No

### OAuth Cluster

- **Bootstrap Server:** `localhost:9092`
- **Authentication:** SASL/OAUTHBEARER
- **Token Endpoint:** `http://localhost:8080/realms/kafka/protocol/openid-connect/token`
- **Client ID:** `kafka-client`
- **Client Secret:** `kafka-client-secret`
- **SSL:** No
- **Keycloak Admin:** http://localhost:8080 (admin/admin)

See [oauth/README.md](oauth/README.md) for more details on the OAuth setup.

## Testing Different Authentication Methods

1. **Start the cluster** you want to test
2. **Open VS Code** with the vscode-kafka extension
3. **Add a new cluster** using the connection details above
4. **Verify connection** by browsing topics, producing/consuming messages

## Cleanup

```bash
# Stop and remove all containers and volumes for a specific cluster
cd test-clusters/<cluster-name> && docker-compose down -v

# Or use the helper script
./stop-cluster.sh all
```

## Troubleshooting

### Check if containers are running
```bash
docker ps
```

### View logs for a specific cluster
```bash
cd test-clusters/<cluster-name> && docker-compose logs -f
```

### Port conflicts
If you get port binding errors, make sure no other services are using ports 9092, 9093, 2181, or 8080.

```bash
# Check what's using a port
lsof -i :9092
```
