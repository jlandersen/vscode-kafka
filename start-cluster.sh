#!/bin/bash

# Start a test Kafka cluster
# Usage: ./start-cluster.sh <cluster-name>
# Available clusters: plaintext, sasl-plain, oauth

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTERS_DIR="$SCRIPT_DIR/test-clusters"

CLUSTER_NAME="${1:-}"

if [ -z "$CLUSTER_NAME" ]; then
    echo "Usage: $0 <cluster-name>"
    echo ""
    echo "Available clusters:"
    echo "  plaintext   - Simple Kafka without authentication (port 9092)"
    echo "  sasl-plain  - Kafka with SASL/PLAIN authentication (port 9093)"
    echo "  oauth       - Kafka with OAUTHBEARER + Keycloak (port 9092)"
    echo ""
    echo "Note: plaintext and oauth both use port 9092, so only run one at a time."
    exit 1
fi

CLUSTER_DIR="$CLUSTERS_DIR/$CLUSTER_NAME"

if [ ! -d "$CLUSTER_DIR" ]; then
    echo "Error: Cluster '$CLUSTER_NAME' not found."
    echo "Available clusters: plaintext, sasl-plain, oauth"
    exit 1
fi

if [ ! -f "$CLUSTER_DIR/docker-compose.yml" ]; then
    echo "Error: No docker-compose.yml found in $CLUSTER_DIR"
    exit 1
fi

echo "Starting $CLUSTER_NAME cluster..."
cd "$CLUSTER_DIR"
docker-compose up -d

echo ""
echo "Cluster '$CLUSTER_NAME' started!"
echo ""

case "$CLUSTER_NAME" in
    plaintext)
        echo "Connection details:"
        echo "  Bootstrap Server: localhost:9092"
        echo "  Authentication: None"
        ;;
    sasl-plain)
        echo "Connection details:"
        echo "  Bootstrap Server: localhost:9093"
        echo "  Authentication: SASL/PLAIN"
        echo "  Username: testuser"
        echo "  Password: testpassword"
        ;;
    oauth)
        echo "Connection details:"
        echo "  Bootstrap Server: localhost:9092"
        echo "  Authentication: SASL/OAUTHBEARER"
        echo "  Token Endpoint: http://localhost:8080/realms/kafka/protocol/openid-connect/token"
        echo "  Client ID: kafka-client"
        echo "  Client Secret: kafka-client-secret"
        echo ""
        echo "Keycloak Admin Console: http://localhost:8080 (admin/admin)"
        echo ""
        echo "Note: Keycloak takes 20-30 seconds to fully start."
        ;;
esac

echo ""
echo "To stop: ./stop-cluster.sh $CLUSTER_NAME"
