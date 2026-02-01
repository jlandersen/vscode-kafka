# Test Cluster for OAUTHBEARER Authentication Testing

This Docker Compose setup creates:
1. **Keycloak** - OAuth 2.0 / OpenID Connect provider for token generation
2. **Kafka** - Apache Kafka broker (PLAINTEXT mode)
3. **Zookeeper** - Kafka coordination

## Purpose

This setup allows you to test the **OAUTHBEARER token fetching** part of the vscode-kafka extension. While the Kafka broker itself uses PLAINTEXT (for simplicity), you can verify that:

1. The extension correctly fetches OAuth tokens from Keycloak
2. Token caching and refresh works properly
3. The UI correctly handles OAUTHBEARER configuration

> **Note:** Testing full end-to-end OAUTHBEARER Kafka authentication requires a more complex Kafka setup with proper JAAS configuration. This simplified setup focuses on testing the OAuth token flow.

## Quick Start

```bash
# Start the cluster
docker-compose up -d

# Wait for services to be ready (about 15-30 seconds)
docker-compose ps

# Verify Keycloak is healthy
curl -s http://localhost:8080/health/ready
```

## Testing OAuth Token Fetch

### Manual Token Test

Verify the OAuth endpoint works:

```bash
curl -X POST http://localhost:8080/realms/kafka/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=kafka-client" \
  -d "client_secret=kafka-client-secret"
```

Expected response:
```json
{
  "access_token": "eyJhbG...",
  "expires_in": 300,
  "token_type": "Bearer",
  ...
}
```

### Testing with vscode-kafka Extension

Since the Kafka broker is in PLAINTEXT mode, we can't do a full OAUTHBEARER test. However, you can:

1. **Add a cluster with OAUTHBEARER settings** to verify the UI works:
   - Name: `OAuth Test Cluster`
   - Bootstrap Server: `localhost:9092`
   - Authentication: `SASL/OAUTHBEARER`
   - Token Endpoint: `http://localhost:8080/realms/kafka/protocol/openid-connect/token`
   - Client ID: `kafka-client`
   - Client Secret: `kafka-client-secret`
   - Enable SSL: `No`

2. **Check the extension logs** to see if token fetching is attempted

3. **Use the PLAINTEXT connection** for actual Kafka operations:
   - Bootstrap Server: `localhost:9092`
   - Authentication: `None`

## Keycloak Admin Console

Access at: http://localhost:8080

- **Username**: `admin`
- **Password**: `admin`

Pre-configured clients in the `kafka` realm:
- `kafka-client` (secret: `kafka-client-secret`) - For extension testing
- `kafka-broker` (secret: `kafka-broker-secret`) - For Kafka broker (if OAUTHBEARER is enabled)

## Cleanup

```bash
docker-compose down -v
```

## Troubleshooting

### Keycloak not starting
```bash
docker-compose logs keycloak
```

### Token endpoint not responding
Wait longer (Keycloak takes 20-30 seconds to fully start) or check:
```bash
docker-compose logs keycloak | grep -i error
```

### Kafka connection issues
```bash
docker-compose logs kafka
```
