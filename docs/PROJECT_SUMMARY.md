# Project Summary & Shared Understanding

This document captures the **current shared understanding** of the project between the author and collaborators/agents.  
It exists to avoid confusion, scope drift, and repeated architectural discussions.

---

## 1. Project Vision

We are building a **free online book library and reader** with a Kindle-like experience:

- Public, SEO-indexable access to book content
- Structured reading by chapters
- Cross-device reading progress
- Notes and bookmarks
- Future offline-first mobile experience

The project is **content-first and SEO-driven**, not an e‑commerce platform.

---

## 2. Core Principles

1. **SEO comes first**
   - Google must be able to index book and chapter pages.
   - Each chapter is a separate URL with real HTML.

2. **Self-hosted**
   - Runs on a personal server / local machine with internet access.
   - No mandatory cloud providers (AWS, GCP, etc.).

3. **Simple MVP first**
   - Avoid premature microservices.
   - Avoid premature mobile apps.
   - Avoid premature S3 abstractions unless needed.

4. **Containers are ephemeral, data is permanent**
   - Docker is used for services.
   - Data lives on the host file system and PostgreSQL.

---

## 3. Technology Stack (Current Decision)

### Backend
- ASP.NET Core (API)
- ASP.NET Core Worker (ingestion)
- PostgreSQL
- Docker + Docker Compose

### Frontend (Current MVP)
- **React (Web)**  
  - Responsive UI
  - Works on desktop and mobile browsers
  - Optional PWA

### Frontend (Later)
- React Native (Expo)
  - Offline-first
  - SQLite cache
  - Sync queue

---

## 4. What We Are NOT Doing Right Now

- ❌ No React Native in MVP
- ❌ No microservices
- ❌ No cloud-only storage (AWS S3)
- ❌ No binary files in the database
- ❌ No heavy SSR framework unless needed

---

## 5. Storage Strategy (Final Decision)

### What is stored on disk (host file system)
- Original book files (`.epub`, `.pdf`, `.fb2`)
- Optional derived assets (covers, cached HTML)

Location example:
```
/srv/books/storage
```

Docker containers mount this directory via **bind mounts**.

### What is stored in PostgreSQL
- Book metadata
- Chapter structure
- Extracted chapter text / HTML
- Reading progress
- Notes, bookmarks
- Ingestion job state

---

## 6. Book Ingestion Model

1. Admin uploads a book file
2. API saves file to disk
3. Ingestion job is created
4. Worker parses the book
5. Chapters and content are extracted
6. Content is stored in PostgreSQL
7. SEO pages become available

Original files are **never served publicly**.

---

## 7. Reader Model

- Users read **extracted chapter HTML**
- Reading position is stored as a **locator**
- Locator is synced across devices
- Notes and bookmarks are versioned

---

## 8. Search

- PostgreSQL Full-Text Search (FTS)
- `tsvector` + `GIN` index
- Ranking via `ts_rank_cd`
- Search works on extracted text

---

## 9. Deployment Model

- Docker Compose:
  - db
  - api
  - worker
  - web
- Reverse proxy + TLS later
- GitHub Actions for CI/CD
- Self-hosted runner on the server

---

## 10. Content & SEO Strategy

- Public-domain / licensed books only
- Slow, consistent publishing (≈1 book per day)
- Sitemap updated automatically
- Internal linking (books ↔ chapters ↔ authors)

This is a **long-term content project**, not a short-term hack.

---

## 11. Roadmap (High Level)

### Phase 1 — MVP
- Docker Compose runs locally
- Upload → ingestion → SEO pages
- Web reader
- Search
- Progress tracking

### Phase 2 — Hardening
- Backups
- Better SEO metadata
- Internal linking
- Performance tuning

### Phase 3 — Mobile
- React Native app
- Offline reading
- Sync queue

---

## 12. Guiding Statement

> We optimize for **clarity, durability, and steady growth**, not for hype or premature scale.

This document should be updated whenever a **major decision changes**.

---
