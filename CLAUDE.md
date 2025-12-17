# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first reading sync.

**Stack:**
- Backend: ASP.NET Core (API + Worker) + PostgreSQL + EF Core
- Frontend: React (web) + React Native Expo (mobile)
- Search: PostgreSQL FTS (tsvector + GIN)

## Repository Structure

```
repo/
├─ backend/src/
│  ├─ Api/              # Minimal API, auth, SEO HTML
│  ├─ Worker/           # Book ingestion pipeline
│  ├─ Infrastructure/   # DbContext, migrations, storage, FTS (aka Persistence)
│  ├─ Domain/           # Entities, value objects
│  └─ Contracts/        # DTOs
├─ apps/
│  ├─ web/              # React (Vite)
│  └─ mobile/           # React Native Expo (later)
├─ packages/            # Shared TS code (api-client, sync, reader)
└─ docs/                # Specs and architecture docs
```

**Infrastructure (Persistence) Layout:**
```
Infrastructure/
├─ Data/AppDbContext.cs, AppDbContextFactory.cs
├─ Data/Entities/       # Book, Chapter, ChapterContent, IngestionJob, User, etc.
├─ Data/Configurations/ # Fluent API configs (BookConfig.cs, etc.)
├─ Migrations/          # EF Core generated
├─ Storage/             # File storage service
└─ Search/              # FTS helpers
```

## Commands

### Local Dev (Full Stack)
```bash
docker compose up --build
```
- API: http://localhost:8080
- Web: http://localhost:5173
- Postgres: localhost:5432

### Backend (when implemented)
```bash
# Run migrations
dotnet ef migrations add <Name> --project backend/src/Infrastructure --startup-project backend/src/Api
dotnet ef database update --project backend/src/Infrastructure --startup-project backend/src/Api

# Run API
dotnet run --project backend/src/Api

# Run Worker
dotnet run --project backend/src/Worker
```

### Frontend (when implemented)
```bash
# Web
pnpm -C apps/web dev

# Mobile
pnpm -C apps/mobile start
```

## Architecture

**Model**: Modular Monolith + Background Worker (not microservices)

**Backend Layers:**
- Controllers → Application Services → Domain → Infrastructure
- Domain has no framework dependencies
- Infrastructure handles EF Core, migrations, storage, FTS SQL

**Backend Modules:**
- Auth: JWT + refresh tokens bound to device
- Content: Books, Assets, Chapters, Ingestion jobs
- Reading: Progress, Locator, Notes/Bookmarks/Highlights
- Search: PostgreSQL FTS w/ GIN indexes
- SEO: Server-rendered HTML pages + sitemap

**Key Decisions:**
- **Locator**: JSON string (`{"type":"text","chapterId":"<uuid>","offset":1234}`)
- **Sync**: Version field + 409 Conflict (MVP); operation log (later)
- **Soft delete**: Notes/highlights/bookmarks use `IsDeleted`
- **FTS**: tsvector on ChapterContent.ContentText
- **File storage**: Host bind mount (not Docker volume) → containers mount `/srv/books/storage:/storage`; files survive container crashes; S3/MinIO later

## Database (EF Core Code First)

- UUIDs for PKs, `DateTimeOffset` for timestamps
- API runs `Database.Migrate()` on startup
- Unique constraints: `Books.Slug`, `Chapters(BookId, Order)`, `Chapters(BookId, Slug)`

**Core Entities:**
- `Book` → `BookFile` (1:N) → `IngestionJob`
- `Book` → `Chapter` (1:N) → `ChapterContent` (1:1)
- `User` → `ReadingProgress`, `Bookmark`, `Note`

**Migration Order:** Initial_Content → Ingestion_Jobs → User_Reading → FTS_Search

## Storage Layout

Files stored on host at `/srv/books/storage`:
```
/srv/books/storage/books/{bookId}/original/{assetId}.epub
/srv/books/storage/books/{bookId}/derived/cover.jpg
```
- DB stores file paths only, not binary content
- Containers are ephemeral; data must be permanent
