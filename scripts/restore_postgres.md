# PostgreSQL Restore Instructions

## Prerequisites

- Docker running
- PostgreSQL container running (`books_db`)
- Backup file (`.sql.gz`)

## Restore Command

```bash
gunzip -c <backup_file> | docker exec -i <container> psql -U <user> <database>
```

### Using Make (Recommended)

```bash
# List available backups
make backup-list

# Restore from specific backup
make restore FILE=backups/db_2024-01-15_143022.sql.gz
```

### Manual Command

```bash
gunzip -c backups/db_YYYY-MM-DD_HHMMSS.sql.gz | docker exec -i books_db psql -U app books
```

### Example

```bash
# Restore from specific backup
gunzip -c backups/db_2024-01-15_143022.sql.gz | docker exec -i books_db psql -U app books
```

## Full Restore (Clean Database)

If you need to restore to a clean state:

```bash
# 1. Drop and recreate database
docker exec books_db psql -U app -d postgres -c "DROP DATABASE IF EXISTS books;"
docker exec books_db psql -U app -d postgres -c "CREATE DATABASE books OWNER app;"

# 2. Restore from backup
gunzip -c backups/db_YYYY-MM-DD_HHMMSS.sql.gz | docker exec -i books_db psql -U app books
```

## Verify Restore

```bash
# Check tables exist
docker exec books_db psql -U app books -c "\dt"

# Check row counts
docker exec books_db psql -U app books -c "SELECT COUNT(*) FROM editions;"
```

## Configuration Override

Use environment variables for non-default setups:

```bash
POSTGRES_CONTAINER=my_postgres \
POSTGRES_USER=myuser \
POSTGRES_DB=mydb \
gunzip -c backup.sql.gz | docker exec -i $POSTGRES_CONTAINER psql -U $POSTGRES_USER $POSTGRES_DB
```

## Safety Notes

- Backups are stored outside Docker volumes (`./backups/`)
- Restore overwrites existing data in target tables
- Test restore on a separate database first if unsure
- Backup rotation keeps last 7 backups by default (set `BACKUP_KEEP=0` to disable)
