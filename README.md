# OnlineLib

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first reading sync.

**Multisite**: Single backend serves multiple branded sites (fiction, programming, etc.) with shared content isolation.

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

### Testing Sites

```
http://localhost:5173/?site=fiction      # ClassicReads theme
http://localhost:5173/?site=programming  # CodeBooks theme
```

In production, sites resolve via Host header (fiction.example.com, programming.example.com).

## Stack

- **Backend**: ASP.NET Core (API + Worker) + PostgreSQL + EF Core
- **Frontend**: React (web), React Native Expo (mobile, later)
- **Search**: PostgreSQL FTS (tsvector + GIN)
- **Multisite**: Host-based resolution, per-site theming, content isolation

## Project Structure

```
├── backend/
│   ├── src/Api/           # Minimal API, auth, SEO HTML
│   │   └── Sites/         # Multisite: SiteResolver, middleware
│   ├── src/Worker/        # Book ingestion pipeline
│   ├── src/Infrastructure/# DbContext, migrations, storage
│   ├── src/Domain/        # Entities, value objects
│   └── src/Contracts/     # DTOs
├── apps/
│   ├── web/               # React (Vite) - public site
│   ├── admin/             # React (Vite) - admin panel
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

## Multisite Architecture

Sites resolve via Host header → SiteResolver → SiteContext per request.

| Entity | Scoping |
|--------|---------|
| Work | site_id (primary) |
| Edition | site_id (denormalized) |
| ReadingProgress, Bookmark, Note | site_id |
| User | Global (cross-site account) |

Key files:
- `backend/src/Api/Sites/` - SiteResolver, SiteContextMiddleware
- `apps/web/src/context/SiteContext.tsx` - frontend site context
- `apps/web/src/config/sites.ts` - per-site theming

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/db_schema.dbml)
- [Multisite Spec](docs/onlinelib-multisite-spec/)
- [Migrations](docs/MIGRATIONS.md)
- [Storage & Resilience](docs/STORAGE_AND_RESILIENCE.md)
