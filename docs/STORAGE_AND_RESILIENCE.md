# Storage & Resilience

## Bind Mounts

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `/srv/books/postgres` | `/var/lib/postgresql/data` | Postgres data |
| `/srv/books/storage` | `/storage` | Book files |

Containers mount host dirs. They don't own data.

## File Layout

```
/srv/books/storage/books/{bookId}/original/{assetId}.epub
/srv/books/storage/books/{bookId}/derived/cover.jpg
```

DB stores paths only, not binaries.

## Docker Crash Recovery

| Scenario | Data |
|----------|------|
| Container crash | Safe |
| Docker daemon restart | Safe |
| Containers deleted | Safe |
| Server reboot | Safe |

Data survives as long as `/srv/books/` exists on host.

## Backups

```bash
# Database
docker exec books_db pg_dump -U app books > /srv/backups/db-$(date +%F).sql

# Files
tar czf /srv/backups/storage-$(date +%F).tar.gz /srv/books/storage
```

Daily cron recommended. Store backups offsite (NAS/external HDD).

## First-Time Setup

```bash
sudo mkdir -p /srv/books/postgres /srv/books/storage /srv/backups
sudo chown -R $USER:$USER /srv/books /srv/backups
```
