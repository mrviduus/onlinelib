#!/bin/bash
set -e

echo "=== Fresh Start (project-only cleanup) ==="
echo "Simulates deploying to a new machine"
echo ""

# Stop and remove project containers, networks, volumes
echo "[1/5] Stopping containers..."
docker compose down -v --remove-orphans 2>/dev/null || true

# Remove project images
echo "[2/5] Removing project images..."
docker images --filter "reference=*onlinelib*" -q | xargs -r docker rmi -f 2>/dev/null || true
docker images --filter "reference=*books*" -q | xargs -r docker rmi -f 2>/dev/null || true

# Remove dangling images and build cache
echo "[3/5] Cleaning build cache..."
docker builder prune -f 2>/dev/null || true

# Remove local data
echo "[4/5] Removing local data..."
rm -rf ./data/postgres ./data/storage 2>/dev/null || true

# Rebuild and start
echo "[5/5] Building fresh..."
docker compose build --no-cache
docker compose up -d

echo ""
echo "=== Fresh start complete ==="
echo "Services starting at:"
echo "  API:   http://localhost:8080"
echo "  Web:   http://localhost:5173"
echo "  Admin: http://localhost:5174"
