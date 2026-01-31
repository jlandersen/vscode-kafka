#!/bin/bash

# Stop Kafka Cluster

echo "🛑 Stopping Kafka Cluster"
echo "========================="
echo ""

docker-compose down

echo ""
echo "✅ Kafka cluster stopped"
echo ""
echo "💡 To delete all data and start fresh, run:"
echo "   docker-compose down -v"
echo ""
