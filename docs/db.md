# Database Layer (EF Core Code First) — Plan & Schema (MVP)

This document defines the **DB-layer architecture** for the Online Library project (content-first, SEO-driven).
It is written to avoid scope drift and to be used as a build plan for implementation.

---

## 1) Goals (MVP)

- Store **book metadata**, **chapter structure**, and **extracted chapter HTML** in PostgreSQL.
- Support ingestion workflow (upload → parse → persist → publish).
- Support reading progress (cross-device), bookmarks, and notes (basic).
- Enable search using **PostgreSQL Full-Text Search (FTS)**.
- Use **EF Core Code First** with migrations as the **single source of truth**.

Non-goals (MVP):
- No binary book files in DB (original files stay on disk).
- No microservices.
- No cloud storage dependencies.

---

## 2) Core Design Decisions (Locked for MVP)

- **PostgreSQL** as the only database.
- **EF Core Code First** + Migrations.
- **Containers are ephemeral**; data is durable:
  - Book files on host disk: `/srv/books/storage`
  - Structured content & state in PostgreSQL.
- **Original files are never served publicly**.
- **SEO pages** are generated from extracted HTML stored in DB.

---

## 3) Solution Structure (Projects)

Recommended:
- `OnlineLib.Api` (ASP.NET Core API)
- `OnlineLib.Worker` (ASP.NET Worker for ingestion)
- `OnlineLib.Persistence` (EF Core DbContext, entities, mappings, migrations)
- (Optional) `OnlineLib.Domain` (domain models / value objects if needed)

Rationale:
- API and Worker share the same `DbContext` and schema.
- Migrations live in one place (`OnlineLib.Persistence`).

---

## 4) EF Core Conventions

### Primary Keys
- Use `Guid` (UUID) as PK for all entities.
- In PostgreSQL: `uuid` type.
- Prefer server-side generation if needed; otherwise generate in app.

### Timestamps
- Use `DateTimeOffset` for all timestamps.
- Fields:
  - `CreatedAt`
  - `UpdatedAt`
  - Optional: `StartedAt`, `FinishedAt`

### Relationships
- Use Fluent API (`IEntityTypeConfiguration<T>`) for:
  - indexes
  - unique constraints
  - cascades
  - column lengths/types

### Text Columns
- `Html`, `PlainText`, `Error` stored as PostgreSQL `text`.

### Slugs
- `Book.Slug` unique globally.
- `Chapter` slug unique per book (or use `(BookId, Order)` for stable URLs).
- Avoid changing slugs once published (SEO stability).

---

## 5) MVP Entity Model (Phase 1)

> Phase 1 must enable: upload → ingestion → chapter pages available for SEO.

### 5.1 Book
Represents a book visible on the site.

Fields:
- `Id: Guid` (PK)
- `Title: string` (required)
- `Language: string` (optional, e.g. "en", "uk")
- `Slug: string` (required, unique)
- `Description: string?`
- `CoverPath: string?` (derived asset path on disk, optional)
- `Status: BookStatus` (Draft/Published)
- `CreatedAt: DateTimeOffset`
- `UpdatedAt: DateTimeOffset`

Indexes/Constraints:
- Unique index on `Slug`.

### 5.2 BookFile (Ingested source)
Tracks the original uploaded file stored on disk.

Fields:
- `Id: Guid` (PK)
- `BookId: Guid` (FK → Book)
- `OriginalFileName: string`
- `StoragePath: string` (absolute or normalized path under `/srv/books/storage`)
- `Format: BookFormat` (Epub/Pdf/Fb2/Other)
- `Sha256: string?` (optional but useful for dedup)
- `UploadedAt: DateTimeOffset`

Indexes/Constraints:
- Index on `(BookId)`.
- Optional unique on `(Sha256)` if dedup is desired later.

### 5.3 Chapter
Book chapter structure and ordering.

Fields:
- `Id: Guid` (PK)
- `BookId: Guid` (FK → Book)
- `Order: int` (required, 1..N)
- `Title: string` (required)
- `Slug: string?` (optional; if used, unique within book)
- `CreatedAt: DateTimeOffset`
- `UpdatedAt: DateTimeOffset`

Indexes/Constraints:
- Unique index on `(BookId, Order)`.
- If `Slug` exists: unique index on `(BookId, Slug)`.

### 5.4 ChapterContent
Stores extracted and sanitized content for reading + SEO.

Relationship:
- 1:1 with Chapter (ChapterContent PK = ChapterId)

Fields:
- `ChapterId: Guid` (PK, FK → Chapter)
- `Html: string` (sanitized HTML)
- `PlainText: string` (for search)
- `WordCount: int?`
- `UpdatedAt: DateTimeOffset`

Notes:
- **Never serve original PDF/EPUB directly**.
- `Html` must be sanitized to avoid XSS.
- Reader renders `Html` as real HTML in SSR/static response or client rendering.

---

## 6) Ingestion Model (Phase 1.5)

Purpose:
- Make ingestion deterministic, retryable, and observable.

### 6.1 IngestionJob
Represents a parsing/extraction job handled by the Worker.

Fields:
- `Id: Guid` (PK)
- `BookId: Guid` (FK → Book)
- `BookFileId: Guid` (FK → BookFile)
- `Status: JobStatus` (Queued/Processing/Succeeded/Failed)
- `AttemptCount: int`
- `Error: string?`
- `CreatedAt: DateTimeOffset`
- `StartedAt: DateTimeOffset?`
- `FinishedAt: DateTimeOffset?`

Indexes/Constraints:
- Index on `Status` for worker polling.
- Index on `CreatedAt`.

Worker rules:
- Worker polls for `Queued` jobs.
- On start: mark `Processing`, set `StartedAt`.
- On success: `Succeeded`, set `FinishedAt`.
- On failure: `Failed`, store `Error`, increment attempts.
- Retrying policy is explicit (max attempts, backoff) but implementation is in Worker.

---

## 7) User Reading Model (Phase 2)

> Phase 2 enables cross-device progress + annotations.

### 7.1 User
Minimal user model (can be replaced/extended later).

Fields:
- `Id: Guid` (PK)
- `ExternalId: string?` (optional for OAuth later)
- `CreatedAt: DateTimeOffset`

### 7.2 ReadingProgress
Stores current reading position per user per book.

Fields:
- `Id: Guid` (PK) OR composite key (UserId, BookId)
- `UserId: Guid` (FK → User)
- `BookId: Guid` (FK → Book)
- `ChapterId: Guid` (FK → Chapter)
- `Locator: string` (position inside chapter)
- `Percent: double?` (optional)
- `UpdatedAt: DateTimeOffset`

Constraints:
- Unique index on `(UserId, BookId)`.

Locator definition (MVP):
- `Locator` is a stable string, e.g.:
  - `"char:1532"` (character offset in PlainText)
  - or `"p:12|o:45"` (paragraph + offset)
Choose one format and keep it stable.

### 7.3 Bookmark
Fields:
- `Id: Guid` (PK)
- `UserId: Guid`
- `BookId: Guid`
- `ChapterId: Guid`
- `Locator: string`
- `Title: string?`
- `CreatedAt: DateTimeOffset`

### 7.4 Note
Fields:
- `Id: Guid` (PK)
- `UserId: Guid`
- `BookId: Guid`
- `ChapterId: Guid`
- `Locator: string`
- `Text: string`
- `Version: int` (optional)
- `CreatedAt: DateTimeOffset`
- `UpdatedAt: DateTimeOffset`

---

## 8) Search (FTS) (Phase 3)

Goal:
- PostgreSQL Full-Text Search over chapter content.

Approach:
- Store `PlainText` in `ChapterContent`.
- Add `SearchVector` column (tsvector) maintained by:
  - generated column (preferred if supported cleanly), OR
  - trigger (common approach).

Schema additions:
- `ChapterContent.SearchVector: tsvector`
- GIN index on `SearchVector`.

Ranking:
- Use `ts_rank_cd(SearchVector, query)` to rank results.
- Query format:
  - `plainto_tsquery` (simple)
  - or `websearch_to_tsquery` (Google-like)
Choose one and standardize.

Language:
- Use English by default; later support config per `Book.Language`.

---

## 9) Migrations Plan (Order)

### Migration 001 — `Initial_Content`
Tables:
- `Books`
- `BookFiles`
- `Chapters`
- `ChapterContents`

### Migration 002 — `Ingestion_Jobs`
Tables:
- `IngestionJobs`

### Migration 003 — `User_Reading`
Tables:
- `Users`
- `ReadingProgress`
- `Bookmarks`
- `Notes`

### Migration 004 — `FTS_Search`
Changes:
- add `SearchVector`
- add trigger/generated column
- add GIN index

Rule:
- Keep migrations small, reviewable, and reversible.
- No breaking changes without a plan.

---

## 10) Implementation Checklist (Concrete Steps)

1) Create `OnlineLib.Persistence` project.
2) Add EF Core + Npgsql packages.
3) Implement `AppDbContext`.
4) Implement Entities (Phase 1) + Configurations via Fluent API.
5) Add first migration `Initial_Content`.
6) Apply migrations with dockerized PostgreSQL.
7) Add ingestion entities + migration.
8) Add user reading entities + migration.
9) Add FTS migration.
10) Add seed data for local dev (1 book, 2 chapters).

---

## 11) Notes on Performance & Safety

- Do not load `ChapterContent.Html` in book/chapter listing endpoints.
  - Use separate query/endpoint for content.
- Sanitize HTML before storing or before serving (prefer before storing).
- Ensure indexes exist for:
  - `(BookId, Order)` on Chapters
  - `Slug` unique on Books
  - `Status` on IngestionJobs
  - `GIN` on FTS vector

---

## 12) Open Questions (Decide Once, Then Lock)

- Locator format:
  - char offset vs paragraph-based.
- Chapter URL scheme:
  - `/books/{bookSlug}/{chapterOrder}` (stable)
  - or `/books/{bookSlug}/{chapterSlug}` (pretty but requires slug stability)
- FTS query mode:
  - `plainto_tsquery` vs `websearch_to_tsquery`
- Language-aware FTS config:
  - single config for MVP vs per-book config later

Pick defaults for MVP and lock them.

---