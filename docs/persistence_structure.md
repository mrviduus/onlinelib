# Persistence Project Structure & Conventions (EF Core + PostgreSQL)

This document defines the **folder structure**, **naming conventions**, and **implementation rules**
for the `OnlineLib.Persistence` project. It is intended to be used by collaborators/agents to implement
the DB layer consistently without architectural drift.

---

## 1) Project Purpose

`OnlineLib.Persistence` is the single place that owns:

- `AppDbContext`
- EF Core entity mappings (Fluent API)
- EF Core migrations
- PostgreSQL-specific configuration (types, indexes, FTS support)
- (Optionally) seed data for local development

API and Worker **consume** this project but must not define their own migrations.

---

## 2) Recommended Solution Layout

```
/src
  /OnlineLib.Api
  /OnlineLib.Worker
  /OnlineLib.Persistence
  /OnlineLib.Domain (optional)
```

---

## 3) Persistence Folder Structure

Inside `/src/OnlineLib.Persistence`:

```
OnlineLib.Persistence/
  OnlineLib.Persistence.csproj

  /Db
    AppDbContext.cs
    AppDbContextFactory.cs

  /Entities
    Book.cs
    BookFile.cs
    Chapter.cs
    ChapterContent.cs
    IngestionJob.cs
    User.cs
    ReadingProgress.cs
    Bookmark.cs
    Note.cs

  /Configurations
    BookConfig.cs
    BookFileConfig.cs
    ChapterConfig.cs
    ChapterContentConfig.cs
    IngestionJobConfig.cs
    UserConfig.cs
    ReadingProgressConfig.cs
    BookmarkConfig.cs
    NoteConfig.cs

  /Migrations
    (EF Core generated)

  /Enums
    BookStatus.cs
    BookFormat.cs
    JobStatus.cs

  /Seed (optional)
    DevSeed.cs
```

---

## 4) Naming Conventions

### Entity naming
- Singular: `Book`, `Chapter`, `IngestionJob`

### Table naming
- Plural table names: `Books`, `Chapters`, `IngestionJobs`

### Column naming
- PascalCase in C#
- One naming strategy in DB (default or snake_case) — choose once and lock

---

## 5) Entity Rules

- All entities use `Guid` PK
- Shared PK for 1:1 (`ChapterContent`)
- Use `DateTimeOffset`
- Large text stored as PostgreSQL `text`
- Slugs are immutable after publish

---

## 6) DbContext & Configurations

- `AppDbContext` exposes `DbSet<>`
- Uses `ApplyConfigurationsFromAssembly`
- `AppDbContextFactory` required for migrations

---

## 7) Migrations Ownership

- All migrations live in Persistence
- No parallel migrations in API or Worker
- Migration names must be explicit

---

## 8) Sharing DbContext

- API: scoped DbContext
- Worker: `IDbContextFactory<AppDbContext>`

---

## 9) Performance Rules

- Do not load large HTML in list queries
- Use DTOs
- Ensure indexes match queries

---

## 10) Full-Text Search

- `tsvector` column
- GIN index
- Trigger or generated column

---

## 11) Seed Data

- Dev-only
- Idempotent
- Never auto-run in prod

---

## 12) Definition of Done

- Clean migrations on fresh DB
- API reads books/chapters
- Worker processes ingestion jobs

---

## 13) Implementation Order

1) Create Persistence project
2) Add EF Core + Npgsql
3) Implement DbContext + Factory
4) Phase 1 entities
5) Initial migration
6) Ingestion migration
7) Reading migration
8) FTS migration
