#!/bin/bash
set -e

echo "=== Docker Build & Start ==="

# Ensure data dirs exist
mkdir -p ./data/postgres ./data/storage

# Build and start
docker compose build --no-cache
docker compose up -d

# Show status
echo ""
echo "=== Services ==="
docker compose ps

echo ""
echo "API:   http://localhost:8080"
echo "Web:   http://localhost:5173"
echo "Admin: http://localhost:5174"
