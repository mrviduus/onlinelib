# Agent Plan: Docker-Compose Local MVP (Postgres + ASP.NET Core API + Worker + Web) with EF Core Migrations + FTS
Date: 2025-12-16 • Target: run locally on a dev machine with **one command** (`docker compose up --build`)  
Stack: **PostgreSQL**, **ASP.NET Core** (API + Worker), **React** (web; RN later)

---

## 0) Non‑Negotiable Requirements (keep in mind)
- **Free book library**: upload book files (EPUB/PDF/FB2/...) → parse → extract chapters + SEO HTML pages.
- **Kindle-like sync**: per-user reading progress, notes, bookmarks; works across devices.
- **Offline-friendly**: MVP uses versioning + conflict responses; advanced uses operation log.
- **Search**: PostgreSQL Full-Text Search (FTS) for chapter content in MVP.
- **Local-first**: Docker Compose with **Postgres** + volumes; file storage in a shared Docker volume.

---

## 1) Repository Layout (recommended)
```
repo/
  docker-compose.yml
  backend/
    Directory.Build.props
    src/
      Api/
        Api.csproj
        Program.cs
        Controllers/
        Features/
        appsettings.json
      Worker/
        Worker.csproj
        Program.cs
        Services/
      Infrastructure/
        Infrastructure.csproj
        Data/
          AppDbContext.cs
          Entities/
          Configurations/
        Migrations/
        Storage/
        Search/
      Domain/
        Domain.csproj
        Entities/
        ValueObjects/
      Contracts/
        Contracts.csproj
        Dtos/
    Docker/
      Api.Dockerfile
      Worker.Dockerfile
  frontend/
    package.json
    vite.config.ts
    src/
      pages/
      components/
      api/
    Dockerfile
  storage/ (ignored by git; only local convenience if needed)
  docs/
    SPECS.md
```

---

## 2) Docker Compose (services & volumes)
### 2.1 Services
- `db`: Postgres 16
- `api`: ASP.NET Core Web API (exposes HTTP port 8080)
- `worker`: background ingestion service (no public ports)
- `web`: React dev server (port 5173)
- `storage_data` volume shared between `api` and `worker` (stores uploaded files)

### 2.2 Compose file (baseline)
Use a single compose file and keep env vars in `.env` for convenience.

**Key env vars:**
- `ConnectionStrings__Default = Host=db;Port=5432;Database=books;Username=app;Password=app`
- `Storage__RootPath = /storage`

---

## 3) Database & EF Core Plan
### 3.1 Choose EF Core Provider
- Use `Npgsql.EntityFrameworkCore.PostgreSQL`

### 3.2 DbContext project placement
- Put `AppDbContext` in `Infrastructure` project.
- `Api` references `Infrastructure`.
- `Worker` references `Infrastructure`.

### 3.3 Entities (minimum set)
**Content:**
- `Book`
- `BookAsset`
- `BookChapter`
- `ChapterContent`
- `BookIngestionJob`

**Users/Reading:**
- `User`
- `Device` (optional but recommended)
- `UserLibrary`
- `ReadingProgress`
- `Note`
- `Bookmark`
- `Highlight` (optional in MVP; keep model ready)

**Sync (optional for advanced):**
- `SyncOperation`

### 3.4 Migrations Strategy
- Use EF Core migrations from `Infrastructure` project.
- Provide a `dotnet ef` command pattern:
  - `dotnet ef migrations add Initial --project backend/src/Infrastructure --startup-project backend/src/Api`
  - `dotnet ef database update --project ... --startup-project ...`

**In Docker:** do not run `dotnet ef` manually. Instead:
- **Option A (recommended):** API runs migrations on startup (`Database.Migrate()`).
- **Option B:** dedicated migration container/job (later).

**MVP choice:** Option A, because it's fastest.

### 3.5 Constraints & Indexes (via Fluent API + migrations)
Must-have:
- `Books.Slug` UNIQUE
- `BookChapters(BookId, OrderIndex)` UNIQUE
- `BookChapters(BookId, Slug)` UNIQUE
- `UserLibrary(UserId, BookId)` PK
- `ReadingProgress(UserId, BookId)` PK + index on `UpdatedAt`
- indexes on `(UserId, BookId)` for notes/bookmarks/highlights

---

## 4) Postgres FTS Plan (MVP)
### 4.1 Extensions
Create via migration SQL:
- `unaccent`
- `pg_trgm` (optional, for fuzzy fallback)

### 4.2 Add `SearchVector` to `ChapterContent`
- Column type `tsvector` (nullable ok)
- Maintain via trigger on `ContentText` updates.

**Migration SQL outline:**
- `CREATE EXTENSION IF NOT EXISTS unaccent;`
- `ALTER TABLE "ChapterContent" ADD COLUMN "SearchVector" tsvector;`
- Trigger function updates SearchVector:
  - `setweight(to_tsvector('simple', unaccent(coalesce(NEW."ContentText", ''))), 'B')`
- Create GIN index:
  - `CREATE INDEX ... USING GIN ("SearchVector");`

### 4.3 Search Query (ranking + paging)
- Use `websearch_to_tsquery('simple', unaccent(@q))`
- Rank: `ts_rank_cd`
- Return:
  - `BookId`, `ChapterId`, `ChapterTitle`, `BookTitle`, `Rank`, and a `Snippet` (optional with `ts_headline`)

Implementation note:
- Prefer **raw SQL** for search endpoint (EF Core `FromSqlInterpolated`) or Dapper.

---

## 5) Storage Plan (files)
### 5.1 MVP Storage
- Store uploaded files in shared Docker volume at `/storage`.
- Directory structure:
  - `/storage/books/{bookId}/original/{assetId}.{ext}`
  - `/storage/books/{bookId}/derived/...` (optional)

### 5.2 Production Note (future)
- Swap to object storage (S3/Azure Blob) behind an interface.

---

## 6) API Layer Plan (ASP.NET Core)
### 6.1 Project setup
- Minimal hosting model.
- Add:
  - Health endpoint: `GET /health`
  - Swagger/OpenAPI.

### 6.2 Auth (MVP)
- JWT access token + refresh token (device-bound).
- Endpoints:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`

For fastest MVP:
- Use ASP.NET Identity OR a lightweight custom auth.
- Recommended for speed: **ASP.NET Identity** with EF Core.

### 6.3 Books / SEO endpoints (public)
- `GET /books` (paged list)
- `GET /books/{slug}` (book page data)
- `GET /books/{slug}/chapters/{chapterSlug}` (chapter page, **SEO HTML**)
- `GET /sitemap.xml` (generated from Books + Chapters)

**SEO HTML strategy (MVP):**
- API serves HTML directly for chapter routes (server-rendered minimal template + chapter HTML).
- Web SPA can still exist for app UX; SEO pages can be served by API.

### 6.4 Upload endpoints (admin/internal)
- `POST /admin/books/upload` (multipart)
  - create Book + Asset + Job(Queued)
  - save file to storage volume
  - return BookId/Slug and JobId

### 6.5 Reading endpoints (auth required)
- `GET /library`
- `POST /library/{bookId}`
- `GET /progress/{bookId}`
- `PUT /progress/{bookId}` (Locator + Version)
- Notes:
  - `GET /notes/{bookId}`
  - `POST /notes` (client-generated uuid)
  - `PUT /notes/{id}` (Versioned)
  - `DELETE /notes/{id}` (soft delete + version)
- Same for bookmarks/highlights.

### 6.6 Search endpoint (public)
- `GET /search?q=...&page=...`
- returns top matching books/chapters + rank + optional snippet

---

## 7) Worker Plan (Ingestion Pipeline)
### 7.1 Worker responsibilities
- Poll `BookIngestionJobs` where `Status = Queued`.
- Set `Status = Processing`.
- Read `BookAsset` file from storage.
- Parse:
  - detect format
  - extract metadata (title/author/language/cover if available)
  - extract chapters
  - generate `ContentHtml` and `ContentText`
- Persist:
  - `BookChapters`, `ChapterContent`
  - update `Books` fields + slug if needed
- Mark job Done/Failed with error message.

### 7.2 Parsing approach
- MVP: implement 1–2 formats first (e.g., EPUB + FB2), add PDF later.
- Keep format parsing behind an interface:
  - `IBookParser.Parse(stream) -> ParsedBook { metadata, chapters[] }`

### 7.3 Idempotency
- Use `FileHash` for dedup.
- If job fails halfway:
  - safe to rerun (delete existing chapters/content for that book before reinsert OR upsert by stable chapter identity).

---

## 8) Offline + Sync Plan (MVP-first)
### 8.1 MVP Conflict Model (Version + 409)
- Entities: ReadingProgress/Note/Bookmark/Highlight have `Version`.
- Update requires matching version:
  - mismatch -> `409 Conflict` + current server entity in response.

### 8.2 Optional Advanced Sync (later)
- Add `SyncOperations` and `/sync/batch`.
- Client queues ops offline, server applies sequentially.

---

## 9) Seeding Data (local dev)
### 9.1 What to seed
- Admin user (optional)
- Sample public-domain books (optional)
- Or at least: a “Hello book” with 1 chapter for smoke testing.

### 9.2 How to seed
- Use `IHostedService` in API for dev environment only:
  - if DB empty -> insert minimal sample rows.
- Avoid heavy seeds in production.

---

## 10) Local Boot Sequence (must work)
### 10.1 Expected dev command
- `docker compose up --build`

### 10.2 Startup flow
1. `db` starts
2. `api` starts:
   - runs `Database.Migrate()`
   - applies FTS extensions + triggers (via migrations)
   - exposes Swagger + health
3. `worker` starts:
   - processes ingestion jobs
4. `web` starts:
   - points to API base URL

### 10.3 Smoke tests
- `GET http://localhost:8080/health` returns OK
- `GET http://localhost:8080/books` returns empty list (or seeded)
- Upload sample book -> job queued -> worker processes -> chapters appear
- `GET /books/{slug}/chapters/{chapterSlug}` returns HTML page

---

## 11) Implementation Checklist (ordered)
### Phase 1 — Scaffold & Compose (fast)
- [ ] Create compose with db/api/worker/web + volumes
- [ ] Scaffold API/Worker projects
- [ ] Add Infrastructure project with DbContext + entities
- [ ] Run locally: API connects to DB

### Phase 2 — EF Core Migrations
- [ ] Create initial migration (tables + constraints + indexes)
- [ ] Add migration for FTS extensions + SearchVector + trigger + GIN index
- [ ] Enable `Database.Migrate()` on API startup

### Phase 3 — Upload + Ingestion
- [ ] Implement upload endpoint -> writes file to `/storage` -> creates Book/Asset/Job
- [ ] Implement worker polling -> parses -> writes chapters/content -> marks job done

### Phase 4 — SEO Pages + Sitemap
- [ ] API route serves HTML chapter page
- [ ] Sitemap endpoint from DB (books + chapters)

### Phase 5 — Reading + Sync (MVP)
- [ ] ReadingProgress endpoints (versioned)
- [ ] Notes + Bookmarks endpoints (soft delete + versioned)
- [ ] Basic search endpoint using Postgres FTS

### Phase 6 — Hardening (after MVP)
- [ ] Add pg_trgm fallback for fuzzy title/author
- [ ] Add rate limiting
- [ ] Add caching for SEO pages (optional)
- [ ] Add advanced sync operation log (optional)

---

## 12) Coding Conventions (so the agent stays consistent)
- Keep controllers thin; put logic in services.
- Use DTOs in `Contracts` project.
- Always return `409` with current entity state on version mismatch.
- Use `timestamptz` everywhere; server is source of truth.
- Use slugs generated on server; store stable slugs.

---

## 13) Deliverables (what “done” looks like)
- Repo builds with Docker Compose.
- DB auto-migrates on startup.
- Upload book -> ingestion -> chapters/HTML stored.
- SEO chapter URL returns HTML suitable for indexing.
- Search endpoint returns ranked chapters.
- User progress and notes persist and sync across sessions.

---
