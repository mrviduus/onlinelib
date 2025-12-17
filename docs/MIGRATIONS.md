# Database Migrations

EF Core migrations via dedicated Docker service. Runs before api/worker start.

## Quick Reference

```bash
# Apply all pending (default)
docker compose up

# Target specific migration (forward or rollback)
MIGRATE_TARGET=Initial_Content docker compose up migrator

# Rollback all (dangerous)
MIGRATE_TARGET=0 docker compose up migrator

# Force re-run migrator
docker compose up migrator --force-recreate

# View migrator logs
docker compose logs migrator
```

## How It Works

```
db (healthy) → migrator → api, worker
                 │
                 ├─ list pending
                 ├─ apply migrations
                 ├─ verify none pending
                 └─ exit 0/1
```

- `service_completed_successfully` blocks api/worker until migrator exits 0
- Migration failure = entire stack fails to start (fail-fast)
- Idempotent: safe to re-run

## Creating New Migrations

```bash
# From repo root
dotnet ef migrations add <MigrationName> \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api

# Example
dotnet ef migrations add Add_UserSettings \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api
```

Then `docker compose up` applies it automatically.

## Rollback

EF Core rollback = migrate to earlier migration name.

```bash
# Rollback to Initial_Content (undoes everything after it)
MIGRATE_TARGET=Initial_Content docker compose up migrator

# Rollback all migrations (empty DB)
MIGRATE_TARGET=0 docker compose up migrator
```

**Warning**: Rollback may lose data. Always backup first in production.

## Local Dev (without Docker)

```bash
# Apply
dotnet ef database update \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api

# Rollback to target
dotnet ef database update Initial_Content \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api

# List migrations
dotnet ef migrations list \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Migrator exits 1 | Check `docker compose logs migrator` |
| api/worker won't start | Migrator failed; fix migration first |
| Stale migrator | `docker compose up migrator --force-recreate` |
| Pending after apply | Check migration code for errors |

## Files

- `backend/Docker/Migrator.Dockerfile` - SDK image w/ EF tools
- `backend/Docker/migrate.sh` - entrypoint script
- `backend/src/Infrastructure/Migrations/` - migration files
