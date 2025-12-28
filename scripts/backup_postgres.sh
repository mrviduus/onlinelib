#!/bin/bash
set -e

# =============================================================================
# PostgreSQL Backup Script
# Creates compressed backups using pg_dump | gzip
# =============================================================================

# Configuration (override via environment variables)
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-books_db}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-books}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"  # Keep last N backups (0 = keep all)

# Generate filename with date and timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting PostgreSQL backup..."
echo "  Container: $POSTGRES_CONTAINER"
echo "  Database:  $POSTGRES_DB"
echo "  User:      $POSTGRES_USER"
echo "  Output:    $BACKUP_FILE"

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "ERROR: Container '$POSTGRES_CONTAINER' is not running"
    exit 1
fi

# Health check - verify database is accepting connections
echo "Running health check..."
if ! docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    echo "ERROR: Database is not ready"
    exit 1
fi
echo "Health check passed"

# Create backup
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

# Verify backup was created and has content
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty or was not created"
    rm -f "$BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"

# Rotate old backups (keep last N)
if [ "$BACKUP_KEEP" -gt 0 ]; then
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f | wc -l | tr -d ' ')
    if [ "$BACKUP_COUNT" -gt "$BACKUP_KEEP" ]; then
        DELETE_COUNT=$((BACKUP_COUNT - BACKUP_KEEP))
        echo "Rotating backups: keeping last $BACKUP_KEEP, deleting $DELETE_COUNT old backup(s)"
        find "$BACKUP_DIR" -name "db_*.sql.gz" -type f | sort | head -n "$DELETE_COUNT" | xargs rm -f
    fi
fi

echo "Done. Total backups: $(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f | wc -l | tr -d ' ')"
