# System Architecture — Free Book Library + Kindle-like Reader

Date: 2025-12-16  
Status: MVP-first, self-hosted, SEO-driven  
Stack: ASP.NET Core, PostgreSQL, React (Web), React Native (Mobile), Docker Compose

---

## 1. Architectural Goals

This architecture is designed to:

- Launch an **MVP fast**
- Support **SEO-first content indexing**
- Provide a **Kindle-like reading experience** across devices
- Support **offline reading and sync**
- Run on a **single self-hosted machine**
- Scale gradually without rewrites

Key principle: **simple now, extensible later**.

---

## 2. High-Level Architecture

### Chosen Model: Modular Monolith + Background Worker

Instead of microservices, we use:

- **API (ASP.NET Core)** — main backend
- **Worker (ASP.NET Core BackgroundService)** — ingestion pipeline
- **PostgreSQL** — single source of truth
- **Shared storage** — local volume (S3 later)

This avoids premature complexity while keeping boundaries clean.

---

## 3. Component Diagram (Logical)

```
User / Search Engine
        |
        v
 Reverse Proxy (TLS)
        |
        v
   ASP.NET Core API
   ├── Auth
   ├── SEO HTML Pages
   ├── Reading / Notes
   ├── Search (FTS)
   └── Admin Upload
        |
        v
   PostgreSQL  ←── Worker
        |
        v
     Storage (Files)
```

---

## 4. Backend Architecture (Internal)

### 4.1 Layered Structure

```
API Layer
  └── Controllers / Endpoints

Application Layer
  └── Use-cases / Services

Domain Layer
  └── Entities / Value Objects

Infrastructure Layer
  ├── EF Core
  ├── Migrations
  ├── Storage
  ├── Search SQL
  └── External Adapters
```

**Rules**
- Controllers call application services
- Services orchestrate domain logic
- Infrastructure handles persistence and IO
- Domain contains no framework dependencies

---

## 5. Core Backend Modules

### 5.1 Authentication Module
- JWT access tokens
- Refresh tokens bound to device
- Offline-safe (no forced logout on network loss)

### 5.2 Content Module
- Books
- Assets (original files)
- Chapters
- Extracted HTML/Text
- Ingestion jobs

### 5.3 Reading Module
- Reading progress
- Locator format
- Notes / bookmarks / highlights
- Version-based conflict detection

### 5.4 Search Module
- PostgreSQL Full-Text Search
- GIN indexes
- Ranking and snippets
- Public search endpoint

### 5.5 SEO Module
- Server-rendered HTML pages
- Sitemap generation
- Canonical URLs

---

## 6. Data Architecture

### 6.1 PostgreSQL as Source of Truth

Used for:
- Relational consistency
- Transactions
- Versioning
- Full-text search
- Analytics

### 6.2 Storage Strategy
- MVP: Docker volume mounted at `/storage`
- Production-ready abstraction for S3 / Blob

### 6.3 Search Strategy
- MVP: PostgreSQL FTS (`tsvector + GIN`)
- Upgrade path: Meilisearch / Elasticsearch

---

## 7. Book Ingestion Architecture

### Pipeline

1. Admin uploads book file
2. API saves file and creates ingestion job
3. Worker picks queued job
4. File is parsed (EPUB/FB2/PDF)
5. Chapters and content extracted
6. Search vectors generated
7. SEO pages become available

### Design Notes
- Idempotent jobs
- Failure-safe (can retry)
- Parsing isolated behind interfaces

---

## 8. Reader & Sync Architecture

### 8.1 Locator Design

Locator stored as JSON string:
```json
{
  "type": "text",
  "chapterId": "<uuid>",
  "offset": 1234
}
```

Shared across:
- Web
- Mobile
- Backend

### 8.2 Sync Strategy (MVP)

- Each mutable entity has a `Version`
- Client updates include version
- Server mismatch → `409 Conflict`
- Client resolves or refreshes state

### 8.3 Offline Behavior

- Reading works fully offline
- Progress/notes queued locally
- Sync resumes when online

---

## 9. Frontend Architecture

### 9.1 Web App
- React (Vite)
- Responsive (desktop + mobile browsers)
- Acts as:
  - Reader UI
  - Account UI
  - Optional PWA

**SEO is not handled here in MVP.**

### 9.2 Mobile App
- React Native (Expo)
- Offline-first
- SQLite cache
- WebView-based reader (HTML chapters)

---

## 10. Deployment Architecture (Self-Hosted)

### 10.1 Runtime Stack
- Docker
- Docker Compose
- Reverse proxy (Traefik / Nginx)
- Let’s Encrypt TLS

### 10.2 Services
- `db`
- `api`
- `worker`
- `web`

### 10.3 CI/CD
- GitHub Actions
- Self-hosted runner on the server
- Build → deploy via Docker Compose

---

## 11. Scaling Strategy (Future)

| Area | MVP | Later |
|----|----|----|
| Backend | Modular monolith | Split services if needed |
| Search | Postgres FTS | Dedicated search engine |
| Storage | Local volume | S3 / Blob |
| SEO | API HTML | Next.js SSR |
| Sync | Versioning | Operation log |
| Mobile | Optional | App store builds |

---

## 12. Why This Architecture Works

- Minimal moving parts
- SEO-friendly from day one
- Mobile-ready without blocking launch
- Easy to operate on a single machine
- Clear upgrade paths without rewrites

---

## 13. Definition of Done (Architecture)

- System runs via `docker compose up`
- SEO pages indexable by Google
- Reading progress syncs across devices
- Ingestion pipeline is reliable
- CI/CD deploys automatically

---

## 14. Guiding Principle

> Build the simplest system that can grow.

Avoid premature microservices. Optimize for **learning speed**, not theoretical scale.

---
