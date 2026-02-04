#!/bin/bash

# Stop a test Kafka cluster
# Usage: ./stop-cluster.sh <cluster-name>
# Available clusters: plaintext, kraft, sasl-plain, oauth, ssl, all

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTERS_DIR="$SCRIPT_DIR/test-clusters"

CLUSTER_NAME="${1:-}"

if [ -z "$CLUSTER_NAME" ]; then
    echo "Usage: $0 <cluster-name>"
    echo ""
    echo "Available clusters:"
    echo "  plaintext   - Simple Kafka without authentication"
    echo "  kraft       - Kafka in KRaft mode (no Zookeeper)"
    echo "  sasl-plain  - Kafka with SASL/PLAIN authentication"
    echo "  oauth       - Kafka with OAUTHBEARER + Keycloak"
    echo "  ssl         - Kafka with SSL/TLS (mTLS)"
    echo "  all         - Stop all clusters"
    exit 1
fi

stop_cluster() {
    local name="$1"
    local dir="$CLUSTERS_DIR/$name"
    
    if [ -d "$dir" ] && [ -f "$dir/docker-compose.yml" ]; then
        echo "Stopping $name cluster..."
        cd "$dir"
        docker-compose down -v
        echo "$name cluster stopped."
    else
        echo "Cluster '$name' not found, skipping."
    fi
}

if [ "$CLUSTER_NAME" = "all" ]; then
    echo "Stopping all clusters..."
    echo ""
    for cluster in plaintext kraft sasl-plain oauth ssl; do
        stop_cluster "$cluster"
        echo ""
    done
    echo "All clusters stopped."
else
    CLUSTER_DIR="$CLUSTERS_DIR/$CLUSTER_NAME"
    
    if [ ! -d "$CLUSTER_DIR" ]; then
        echo "Error: Cluster '$CLUSTER_NAME' not found."
        echo "Available clusters: plaintext, kraft, sasl-plain, oauth, ssl, all"
        exit 1
    fi
    
    stop_cluster "$CLUSTER_NAME"
fi
