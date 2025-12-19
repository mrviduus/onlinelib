# CLAUDE.md

AI assistant context for OnlineLib codebase.

## Project

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first sync.

**Stack**: ASP.NET Core (API + Worker) + PostgreSQL + React + Multisite

## Structure

```
backend/src/
├─ Api/              # Endpoints, Sites/
├─ Application/      # Services
├─ Domain/           # Entities
├─ Infrastructure/   # EF Core, Storage
├─ Worker/           # Ingestion
└─ Contracts/        # DTOs

apps/
├─ web/              # React public
├─ admin/            # React admin
└─ mobile/           # Expo (later)

docs/
├─ 00-vision/        # Goals, roadmap
├─ 01-architecture/  # Design, ADRs
├─ 02-system/        # DB, API, specs
├─ 03-ops/           # Local dev, backup
└─ 04-dev/           # Testing, security
```

## Commands

```bash
docker compose up --build          # Full stack
dotnet run --project backend/src/Api
dotnet run --project backend/src/Worker
pnpm -C apps/web dev
```

| Service | URL |
|---------|-----|
| API | http://localhost:8080 |
| Web | http://localhost:5173 |
| Admin | http://localhost:5174 |

## Key Concepts

**Entities**: Site → Work → Edition → Chapter
- Work = canonical book, Edition = per language (EN, UK)
- site_id scopes content; User is global

**Multisite**: Host header → SiteResolver → SiteContext
- Dev override: `?site=general`
- Files: `backend/src/Api/Sites/`

**Storage**: Host bind mount at `/srv/books/storage`
- DB stores paths only, not binaries

## Documentation

- [Vision](docs/00-vision/README.md)
- [Architecture](docs/01-architecture/README.md)
- [Database](docs/02-system/database.md)
- [Local Dev](docs/03-ops/local-dev.md)
- [ADRs](docs/01-architecture/adr/)
