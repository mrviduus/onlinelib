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

**Entity Hierarchy**: Site → Work → Edition → Chapter
- Work = canonical book (just slug), Edition = per-language version with metadata
- Edition contains: title, description, authors_json, cover_path, SEO fields
- Chapter contains: html (rendered), plain_text (search), search_vector (FTS)
- site_id scopes content; User is global

**Book Upload Flow**:
```
Upload EPUB/PDF/FB2 → BookFile (stored) → IngestionJob (queued)
     → Worker polls → Extraction → Chapters created → search_vector indexed
```

**Multisite**: Host header → SiteResolver → SiteContext
- Dev override: `?site=general`
- Files: `backend/src/Api/Sites/`

**Storage**:
- Files: `./data/storage/books/{editionId}/original/` (bind mount)
- DB: `book_files.storage_path` = relative path only
- Content: `chapters.html` + `chapters.plain_text` after parsing

**Search**: PostgreSQL FTS + pg_trgm
- `chapters.search_vector` (tsvector) for full-text
- GIN indexes for fast queries
- Fuzzy search via trigrams

## API Endpoints

**Public**:
- `GET /books` — list editions (paginated, ?language=)
- `GET /books/{slug}` — edition detail + chapters + other editions
- `GET /books/{slug}/chapters/{chapterSlug}` — chapter HTML + prev/next
- `GET /search?q=` — full-text search
- `GET /seo/sitemap.xml` — dynamic sitemap

**Admin**:
- `POST /admin/books/upload` — create Work + Edition + BookFile + IngestionJob
- `GET /admin/ingestion/jobs` — list jobs
- `GET /admin/ingestion/jobs/{id}` — job detail

## Key Files

| Area | Path |
|------|------|
| Domain | `backend/src/Domain/Entities/{Work,Edition,Chapter,BookFile}.cs` |
| API | `backend/src/Api/Endpoints/{Books,Seo,Search}Endpoints.cs` |
| Services | `backend/src/Application/{Books,Ingestion,Seo}/` |
| Worker | `backend/src/Worker/Services/IngestionWorkerService.cs` |
| Search | `backend/src/Search/` |
| Frontend | `apps/web/src/pages/{BooksPage,BookDetailPage}.tsx` |
| Extraction | `backend/src/Extraction/OnlineLib.Extraction/` |

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
