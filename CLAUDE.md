# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first sync.

**Stack**: ASP.NET Core (API + Worker) + PostgreSQL + React + Multisite

## Commands

```bash
# Full stack
docker compose up --build

# Backend only
dotnet run --project backend/src/Api
dotnet run --project backend/src/Worker

# Frontend
pnpm -C apps/web dev
pnpm -C apps/admin dev

# Tests
dotnet test                                             # All tests
dotnet test tests/OnlineLib.UnitTests                   # Unit tests
dotnet test tests/OnlineLib.IntegrationTests            # Integration tests
dotnet test tests/OnlineLib.Extraction.Tests            # Extraction tests
dotnet test --filter "FullyQualifiedName~ClassName"     # Single class
dotnet test --filter "Name~TestMethodName"              # Single method

# Migrations
dotnet ef migrations add <Name> --project backend/src/Infrastructure --startup-project backend/src/Api

# Docker helpers
./scripts/docker-clean.sh    # Stop + remove project images/volumes
./scripts/docker-build.sh    # Fresh build + start
```

| Service | URL |
|---------|-----|
| API | http://localhost:8080 |
| API Docs | http://localhost:8080/scalar/v1 |
| Web | http://localhost:5173 |
| Admin | http://localhost:5174 |
| Grafana | http://localhost:3000 |

## Key Concepts

**Entities**: Site → Work → Edition → Chapter
- Work = canonical book, Edition = per language (EN, UK)
- site_id scopes content; User is global

**Multisite**: Host header → SiteResolver → SiteContext
- Dev override: `?site=general`
- Files: `backend/src/Api/Sites/`

**Storage**: Host bind mount at `./data/storage`
- DB stores paths only, not binaries

## IMPORTANT — HOW TO WORK IN THIS REPO

- Work strictly in **small slices**.
- Each slice must be **independently mergeable**.
- Follow **PDD + TDD**: tests first (RED), then code (GREEN), then refactor.
- **Do not expand scope** beyond the given slice.
- If extra work is discovered, list it under **Follow-ups**, do NOT implement it.
- `dotnet test` must pass for every slice.
- Report results: Summary / Files / Tests / Manual / Follow-ups format.

## Known Technical Debt

- 3 site resolution sources (HostSiteResolver, SiteResolver, frontend SiteContext) - needs consolidation
- User entity features (ReadingProgresses, Bookmarks, Notes) unused in API
- AdminAuditLog entity defined but never used
