# OnlineLib

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first reading sync.

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:8080 |
| API Docs | http://localhost:8080/scalar/v1 |
| Web | http://localhost:5173 |
| Admin | http://localhost:5174 |
| Postgres | localhost:5432 |

## Stack

- **Backend**: ASP.NET Core (API + Worker) + PostgreSQL + EF Core
- **Frontend**: React (web), React Native Expo (mobile, later)
- **Search**: PostgreSQL FTS (tsvector + GIN)

## Project Structure

```
├── backend/
│   ├── src/Api/           # Minimal API, auth, SEO HTML
│   ├── src/Worker/        # Book ingestion pipeline
│   ├── src/Infrastructure/# DbContext, migrations, storage
│   ├── src/Domain/        # Entities, value objects
│   └── src/Contracts/     # DTOs
├── apps/
│   ├── web/               # React (Vite)
│   └── mobile/            # React Native Expo (later)
├── packages/              # Shared TS code
└── docs/                  # Architecture docs
```

## Development

### Migrations

Migrations run automatically via dedicated Docker service before api/worker start.

```bash
# Apply all pending (default)
docker compose up

# Rollback to specific migration
MIGRATE_TARGET=Initial_Content docker compose up migrator

# Create new migration
dotnet ef migrations add <Name> \
  --project backend/src/Infrastructure \
  --startup-project backend/src/Api
```

See [docs/MIGRATIONS.md](docs/MIGRATIONS.md) for details.

### Local Dev (without Docker)

```bash
# Backend
dotnet run --project backend/src/Api

# Worker
dotnet run --project backend/src/Worker

# Web
pnpm -C apps/web dev
```

## Storage

Files on host at `./data/storage`:
```
./data/storage/books/{bookId}/original/{assetId}.epub
./data/storage/books/{bookId}/derived/cover.jpg
```

DB stores paths only. Containers mount via bind mount.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/db.md)
- [Migrations](docs/MIGRATIONS.md)
- [Storage & Resilience](docs/STORAGE_AND_RESILIENCE.md)
