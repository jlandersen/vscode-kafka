#!/bin/bash

# Quick Kafka Cluster Startup Script
# Starts a local Kafka cluster for testing the SecretStorage implementation

set -e

echo "🚀 Starting Local Kafka Cluster"
echo "================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start docker-compose
echo "📦 Starting Kafka services..."
echo ""
docker-compose up -d

echo ""
echo "⏳ Waiting for services to start (15 seconds)..."
sleep 15

# Check status
echo ""
echo "📊 Service Status:"
echo "------------------"
docker-compose ps

echo ""
echo "🔍 Checking Kafka connectivity..."
echo ""

# Test kafka (no auth)
if docker exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; then
    echo "✅ Kafka (no auth) - localhost:9092 - READY"
else
    echo "⚠️  Kafka (no auth) - localhost:9092 - NOT READY (may need more time)"
fi

# Test kafka-sasl
if docker exec kafka-sasl kafka-broker-api-versions --bootstrap-server localhost:9093 > /dev/null 2>&1; then
    echo "✅ Kafka SASL - localhost:9093 - READY"
else
    echo "⚠️  Kafka SASL - localhost:9093 - NOT READY (may need more time)"
fi

echo ""
echo "✅ Cluster Started Successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Available Kafka Brokers:"
echo ""
echo "1️⃣  Simple Broker (No Authentication):"
echo "   Bootstrap Server: localhost:9092"
echo "   Use for: Basic testing"
echo ""
echo "2️⃣  SASL Broker (With Authentication):"
echo "   Bootstrap Server: localhost:9093"
echo "   Use for: Testing SecretStorage"
echo ""
echo "   Available Users:"
echo "   • testuser / testpassword"
echo "   • admin / admin-secret"
echo "   • alice / alice-secret"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Next Steps:"
echo ""
echo "   1. Press F5 in VS Code to start Extension Development"
echo "   2. In the Extension Host, add a Kafka cluster:"
echo "      • For simple testing: localhost:9092 (no auth)"
echo "      • For SecretStorage testing: localhost:9093 (SASL/PLAIN)"
echo "        Username: testuser"
echo "        Password: testpassword"
echo ""
echo "   3. Follow TESTING_SECRETSTORAGE.md for detailed tests"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Useful Commands:"
echo ""
echo "   View logs:    docker-compose logs -f"
echo "   Stop cluster: docker-compose down"
echo "   Check status: docker-compose ps"
echo ""
