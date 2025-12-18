#!/bin/bash
# Seed sample books into the database
# Usage: ./seed.sh [container_name] [db_name]

CONTAINER=${1:-books_db}
DB=${2:-books}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

docker exec -i "$CONTAINER" psql -U app -d "$DB" -f - < "$SCRIPT_DIR/seed-books.sql"
