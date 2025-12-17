# OnlineLib – MVP Execution Plan & Checklist

This document defines the **exact execution order** and **checklists** for building OnlineLib.
Goal: **SEO‑first, content‑first, boring infrastructure, steady progress**.

---

## Phase 0 — Baseline & Migrations (FOUNDATION)

### 0.1 Environment sanity
- [x] `docker compose up --build` works on clean machine
- [x] `.env.example` exists and is complete (defaults in compose, .env optional)
- [x] Host storage directory exists and is bind-mounted (`./data/storage`)
- [x] Containers are ephemeral, data is persistent
- [x] Deleting containers does NOT delete books or DB

### 0.2 Database migrations validation
**Fresh database**
- [x] `docker compose down -v`
- [x] `docker compose up --build`
- [x] migrator exits with code `0`
- [x] `__EFMigrationsHistory` exists
- [x] latest migrations applied (Initial_WorkEdition_Admin)

**Idempotency**
- [x] Re-run compose → migrator does nothing
- [x] No schema changes on second run

**Rollback**
- [ ] Roll back to previous migration
- [ ] Roll forward again successfully

**Multiple DbContexts (if applicable)**
- [x] Correct migration assembly per context (single AppDbContext)
- [x] Deterministic execution order
- [x] No accidental cross-context usage

**Deliverable**
- ✅ Database lifecycle is predictable and boring

---

## Phase 1 — Vertical Slice: Upload → Ingest → Read (SEO CORE)

### 1.1 Data model (minimum)
> Note: Model refactored to Work/Edition for multilingual support

- [x] Work (canonical book identity)
  - originalLanguage
  - timestamps
- [x] Edition (language-specific version, replaces Book)
  - workId
  - language
  - title
  - authorsJson
  - description
  - slug
  - status
  - sourceEditionId (for translations)
- [x] BookFile
  - editionId
  - storagePath
  - originalFileName
  - format
  - sha256
- [x] Chapter
  - editionId
  - chapterNumber
  - title
  - slug
  - html
  - plainText
  - wordCount
  - searchVector (FTS)
- [x] IngestionJob
  - editionId
  - bookFileId
  - targetLanguage
  - status
  - error
  - timestamps

Rule: **Original files are never publicly served**

---

### 1.2 Admin upload
- [ ] `POST /admin/books/upload`
- [ ] Save file to disk (bind mount)
- [ ] Create Book + BookFile + IngestionJob
- [ ] Return bookId + jobId

Quality gates:
- [ ] Validate file type
- [ ] Limit file size
- [ ] Deterministic file naming
- [ ] Hash-based deduplication (optional)

---

### 1.3 Worker ingestion (EPUB first)
- [ ] Poll queued jobs
- [ ] Extract metadata
- [ ] Extract chapters
- [ ] Generate clean HTML
- [ ] Extract plain text
- [ ] Store chapters in Postgres
- [ ] Mark job success/failure

Quality gates:
- [ ] Stable chapter order
- [ ] Sanitized HTML
- [ ] No inline scripts

---

### 1.4 Public SEO pages
- [ ] `/books`
- [ ] `/books/{bookSlug}`
- [ ] `/books/{bookSlug}/chapters/{chapterSlug}`

SEO requirements:
- [ ] Real HTML response
- [ ] Unique `<title>` per page
- [ ] Meta description
- [ ] Canonical URL

**Deliverable**
- ✅ One book can be uploaded and read via indexable URLs

---

## Phase 2 — Reader Experience

### 2.1 Reader UI
- [ ] Chapter navigation
- [ ] Font size control
- [ ] Line height control
- [ ] Light/Dark theme
- [ ] Mobile-friendly layout

---

### 2.2 Reading progress
Locator (MVP):
- chapterId + scroll percentage

Backend:
- [x] ReadingProgress table (schema done)
- [ ] Save progress on debounce
- [ ] Resume reading

**Deliverable**
- ✅ Cross-device resume works

---

## Phase 3 — Search (Postgres FTS)

### 3.1 Indexing
- [x] tsvector column (Chapter.SearchVector)
- [x] GIN index (configured in ChapterConfiguration)
- [ ] ts_rank_cd ranking

### 3.2 Search API + UI
- [ ] `/search?q=`
- [ ] Snippet per result
- [ ] Chapter-level links

**Deliverable**
- ✅ Full-text search across library

---

## Phase 4 — Notes & Bookmarks

### 4.1 Bookmarks
- [ ] Save bookmark with locator
- [ ] List per book
- [ ] Jump to bookmark

### 4.2 Notes
- [ ] Attach note to locator
- [ ] Edit / delete
- [ ] Export (later)

---

## Phase 5 — SEO Hardening

### 5.1 Sitemaps
- [ ] `/sitemap.xml`
- [ ] `/sitemap-books.xml`
- [ ] `/sitemap-chapters.xml`

### 5.2 Structured data
- [ ] Schema.org Book
- [ ] Breadcrumb markup

### 5.3 Crawl quality
- [ ] No duplicate URLs
- [ ] Internal linking
- [ ] Fast TTFB

**Deliverable**
- ✅ Google-friendly content graph

---

## Phase 6 — Ops & Durability

- [ ] Automated Postgres backups
- [ ] Storage directory backups
- [ ] Restore tested
- [x] Health checks (API /health endpoint)
- [x] Admin audit log (AdminAuditLog table)

**Deliverable**
- ✅ You can recover from mistakes

---

## Immediate Next 10 Tasks

1. Validate migrations
2. Implement upload endpoint
3. EPUB ingestion worker
4. Chapter public page
5. Book detail page
6. Reader UI basics
7. Reading progress
8. Full-text search
9. Sitemap generation
10. Backup & restore test

---

> Guiding rule: **Optimize for clarity, durability, and steady growth**
