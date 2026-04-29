#!/usr/bin/env bash
# Restore a pg_dump backup into a throwaway postgres container and run sanity queries.
# Usage: ./backup-verify.sh <path-to-backup.sql.gz>

set -euo pipefail

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 2
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "File not found: $BACKUP_FILE" >&2
  exit 2
fi

CONTAINER="textstack_backup_verify_$$"
PORT=$(( 15432 + RANDOM % 1000 ))
PG_USER="verify"
PG_DB="verify"
PG_PASS="verify"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[verify] starting postgres on :$PORT ..."
docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD="$PG_PASS" \
  -e POSTGRES_DB="$PG_DB" \
  -p "$PORT:5432" \
  postgres:16 >/dev/null

echo "[verify] waiting for postgres to accept connections ..."
for i in {1..30}; do
  if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
  echo "[verify] FAIL: postgres did not become ready" >&2
  exit 1
fi

echo "[verify] pre-creating roles referenced by dump ..."
docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "CREATE ROLE textstack_prod;" >/dev/null 2>&1 || true

echo "[verify] restoring $BACKUP_FILE ..."
# Redirect stderr to catch restore errors; NOTICE/WARNING on reload are normal.
if ! gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" --set=ON_ERROR_STOP=on >/dev/null; then
  echo "[verify] FAIL: restore aborted on error" >&2
  exit 1
fi

echo "[verify] running sanity queries ..."
QUERY="
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tables,
  (SELECT count(*) FROM pg_catalog.pg_class WHERE relkind = 'i' AND relnamespace = 'public'::regnamespace)::int AS indexes,
  COALESCE((SELECT count(*) FROM users), 0)::int AS users,
  COALESCE((SELECT count(*) FROM editions), 0)::int AS editions,
  COALESCE((SELECT count(*) FROM chapters), 0)::int AS chapters;
"
RESULT=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At -F'|' -c "$QUERY")
IFS='|' read -r TABLES INDEXES USERS EDITIONS CHAPTERS <<< "$RESULT"

echo "[verify] tables=$TABLES indexes=$INDEXES users=$USERS editions=$EDITIONS chapters=$CHAPTERS"

FAIL=0
if [[ "${TABLES:-0}" -lt 10 ]]; then
  echo "[verify] FAIL: too few tables ($TABLES) — schema looks truncated" >&2
  FAIL=1
fi
if [[ "${EDITIONS:-0}" -lt 1 ]]; then
  echo "[verify] FAIL: editions table empty — data loss suspected" >&2
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "[verify] OK"
fi
exit "$FAIL"
