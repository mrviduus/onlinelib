# Monorepo Frontend Structure (Web + Mobile) — Basic Architecture Guide
Date: 2025-12-16 • Stack: ASP.NET Core (API/Worker) + Postgres + React (Web) + React Native Expo (Mobile)

This document describes the recommended **repository structure** for building:
- **Web**: SEO-friendly library + reader that works well on desktop and mobile browsers
- **Mobile**: React Native app (Expo) optimized for offline reading and smooth UX
- **Shared code**: API client, sync logic, locator format, and reusable UI components

---

## 1) Why a Monorepo (single repo)
A monorepo makes it easy to:
- keep the web/mobile apps aligned on **API contracts** and **data models**
- share core logic (sync, locator, API client) without copy/paste
- run CI/CD and deployments from one place

**Important:** Web and Mobile should **not** live in the same app folder. They have different tooling (Vite/Next vs Expo), different build pipelines, and different runtime expectations (SEO).

---

## 2) Recommended Folder Structure

```
repo/
├─ backend/                          # ASP.NET Core API + Worker + Infrastructure
│  ├─ src/
│  │  ├─ Api/                        # Public API (REST), SEO HTML endpoints, auth
│  │  ├─ Worker/                     # Ingestion pipeline (parse books, extract text)
│  │  ├─ Infrastructure/             # EF Core DbContext, migrations, storage, FTS SQL
│  │  ├─ Domain/                     # Domain entities/value objects (optional)
│  │  └─ Contracts/                  # DTOs (C#) and shared contracts
│  └─ Docker/                        # Api.Dockerfile, Worker.Dockerfile
│
├─ apps/
│  ├─ web/                           # Web application (React)
│  │  ├─ src/
│  │  ├─ public/
│  │  ├─ Dockerfile
│  │  └─ README.md
│  │
│  └─ mobile/                        # Mobile app (React Native Expo)
│     ├─ app/                        # Expo Router (or src/ if not using router)
│     ├─ assets/
│     ├─ app.json
│     └─ README.md
│
├─ packages/                         # Shared code across web + mobile
│  ├─ api-client/                    # Typed TS client (OpenAPI -> generated)
│  ├─ sync/                          # Offline queue + conflict helpers
│  ├─ reader/                        # Locator format + progress calculation
│  ├─ ui/                            # Shared UI components (optional)
│  └─ utils/                         # Shared helpers (slugs, dates, text utils)
│
├─ docs/                             # Product + engineering docs
│  ├─ SPECS.md
│  ├─ MVP_PLAN.md
│  └─ ARCHITECTURE.md                # (this file)
│
├─ docker-compose.yml                # Local dev stack (db + api + worker + web)
├─ .env.example                      # Environment variables template
├─ package.json                      # Workspace root (pnpm/yarn workspaces)
└─ .github/workflows/                # CI/CD (GitHub Actions)
```

---

## 3) What Goes Where (Responsibilities)

### 3.1 `backend/`
**Owns:**
- Authentication (JWT + refresh)
- Book ingestion (upload -> parse -> chapters/content)
- SEO HTML endpoints (book + chapter pages)
- Postgres schema + EF Core migrations
- Full-text search (tsvector + GIN + ranking queries)

**Key subprojects:**
- `Api/`: HTTP API + SEO HTML endpoints + sitemap
- `Worker/`: ingestion jobs (parse books)
- `Infrastructure/`: DbContext, migrations, storage, FTS SQL, repositories

---

### 3.2 `apps/web/`
**Owns:**
- Web UI for browsing, reading, and account pages
- Mobile-friendly responsive UI (works well on phones via browser)
- (Optional) PWA packaging if desired

**Does not own:**
- SEO rendering (in MVP it can be served by API for best indexing)
- Parsing logic

---

### 3.3 `apps/mobile/` (Expo)
**Owns:**
- Offline-first reading experience
- Local cache (SQLite / file cache)
- Sync queue handling (client-side)
- Reader UI (often via WebView rendering extracted chapter HTML)

**Does not own:**
- SEO pages (search engines index the web, not apps)

---

### 3.4 `packages/` (Shared)
Only place truly cross-platform logic here.

Recommended packages:
- `packages/api-client/`
  - generated TS client from OpenAPI
  - used by web + mobile
- `packages/sync/`
  - offline queue schema (client side)
  - retry + backoff
  - conflict handling helpers (409 responses)
- `packages/reader/`
  - Locator format parsing/serialization
  - “progress calc” utilities
- `packages/ui/` (optional)
  - shared UI components (buttons, cards)
  - keep platform assumptions minimal
- `packages/utils/`
  - date/time helpers, slug helpers, text utilities

---

## 4) Workspaces (Package Manager)
Use one of:
- **pnpm workspaces** (recommended)
- yarn workspaces
- npm workspaces

Example workspace root files:
- `package.json` at repo root with `workspaces: ["apps/*", "packages/*"]`

This enables:
- `pnpm -C apps/web dev`
- `pnpm -C apps/mobile start`
- `pnpm -C packages/api-client build`

---

## 5) Local Development: How It Runs Together

### 5.1 Start backend + db + worker + web
From repo root:
```bash
docker compose up --build
```

Expected:
- API: http://localhost:8080
- Web: http://localhost:5173
- Postgres: localhost:5432 (for debugging)
- Worker: runs ingestion in background

### 5.2 Mobile development (separate process)
From repo root:
```bash
cd apps/mobile
pnpm install
pnpm start
```

Mobile calls the API using your dev machine IP:
- `http://<your-lan-ip>:8080`
(You cannot use `localhost` from a phone.)

---

## 6) Deployment Mindset (Self-Hosted)
For your local server machine with internet access:
- deploy `db + api + worker` via Docker Compose
- expose API and SEO pages through reverse proxy + TLS (Traefik/Nginx)
- deploy web either:
  - as a container behind proxy, or
  - as static files served by the API/proxy

Mobile deployment (App Store) is separate and can come later.

---

## 7) Minimal “Start Web First” Option (Even Faster MVP)
If you want the fastest time-to-launch:
- create only `apps/web/` first
- postpone `apps/mobile/` until the web MVP and SEO are validated

---

## 8) Naming Conventions (Consistency)
- Backend services:
  - `books_api`, `books_worker`, `books_db`
- Environment variables:
  - `ConnectionStrings__Default`
  - `Storage__RootPath`
  - `VITE_API_BASE_URL`
- Shared types:
  - Locator stored as JSON string with stable keys (`type`, `chapterId`, offsets)

---

## 9) “Done” Criteria for This Structure
- Web and backend run with one `docker compose up --build`
- Mobile can be started independently (Expo)
- Shared packages compile and are importable from both web and mobile
- CI can build backend + web without needing mobile build tooling

---
