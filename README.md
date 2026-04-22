# TextStack

<p align="center">
  <img src="docs/assets/hero.png" alt="TextStack — Language learning through reading" width="800">
</p>

<p align="center">
  <strong>Language learning platform powered by long-form reading.</strong><br>
  Read classic literature, build vocabulary with spaced repetition, track your progress.
</p>

<p align="center">
  <a href="https://textstack.app">textstack.app</a>
</p>

---

## Features

**Reader**
- Kindle-like reading experience — themes (light/sepia/dark), fonts, fullscreen, keyboard shortcuts
- Text selection — dictionary lookup (Free Dictionary API), translation (LibreTranslate), highlights
- TTS — Edge TTS via direct WebSocket, 200+ voices, speed control (0.75x–2.0x), two-layer cache (server disk + IndexedDB)
- Offline reading — PWA with IndexedDB caching, download manager, resume support

**Vocabulary & SRS**
- Save words while reading — sentence context, dictionary definition, translation
- Spaced repetition — 5 stages (New → Recognition → Recall → Context → Mastered), 3 review modes (multiple choice, typed recall, context fill-in-the-blank)
- LLM-generated distractors & hints (Ollama gemma3:4b)

**Library**
- 1,500+ public domain books (English + Ukrainian)
- User uploads — EPUB/PDF/FB2, auto-parsed with metadata enrichment (Ollama generates genre, year, description)
- Reading progress sync, bookmarks, highlights
- Reading stats — heatmap calendar, weekly charts, daily/yearly goals, streak tracking, 20 achievements

**Blog**
- Admin-authored posts with comments, likes, share buttons
- Per-language content (en/uk), threaded comments (2-level max), SEO-optimized

**Social**
- [Reading Rooms](docs/05-features/reading-rooms.md) — co-read a public book with friends, see each other's highlights & notes overlaid in real time

**SEO**
- SSG prerendered pages (Puppeteer worker, polls DB every 5s) — books, authors, genres, blog
- Sitemap XML auto-generation, IndexNow (Bing/Yandex)
- Article JSON-LD, FAQ schema markup

**Admin Panel** ([textstack.dev](https://textstack.dev))
- Book/author/genre CRUD, bulk import, chapter editor
- Blog management — create, edit, publish, cover upload
- SSG rebuild, ingestion queue, settings

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | ASP.NET Core (.NET 10), Minimal APIs |
| Database | PostgreSQL 16, EF Core (snake_case) |
| Search | PostgreSQL FTS / Meilisearch (swappable) |
| Frontend | React 18, Vite, pnpm, CSS Variables |
| Admin | React (separate app), JWT auth |
| Mobile | React Native (Expo) |
| TTS | Edge TTS (WebSocket, no API key) |
| Translation | LibreTranslate (self-hosted) |
| LLM | Ollama (gemma3:4b) — metadata, vocab distractors |
| SSG | Puppeteer prerender, nginx serves static first |
| Telemetry | OpenTelemetry → .NET Aspire Dashboard |
| Infra | Docker Compose, Cloudflare Tunnel, nginx |

**Prerequisites**: Docker, .NET 10 SDK, Node.js 18+, pnpm

---

## Quick Start

```bash
cp .env.example .env          # Edit with real values
docker compose up --build     # Start all services
```

| Service | URL |
|---------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:8080 |
| API Docs | http://localhost:8080/scalar/v1 |
| Admin | http://localhost:81 |
| Aspire | http://localhost:18888 |

---

## Project Structure

```
backend/src/
  Api/              Minimal API, endpoints, middleware
  Worker/           Book ingestion, metadata generation
  Domain/           Entities, enums
  Infrastructure/   EF Core, migrations, storage
  Application/      Business logic, interfaces
  Contracts/        Shared DTOs (request/response)
  Search/           FTS providers (Postgres, Meilisearch)
  Extraction/       EPUB/PDF/FB2 parsers
  Tts/              Edge TTS client + caching service

apps/
  web/              Public site (React + Vite)
  admin/            Admin panel (React + Vite)
  mobile/           Mobile app (React Native + Expo)
```

**Architecture**: `API → Application → Domain ← Infrastructure`

---

## Commands

```bash
# Docker
make up / down / restart / logs / status
make build                    # docker compose up -d --build
make rebuild                  # Full rebuild --no-cache
make deploy                   # Full deploy (pull, build, restart, SSG)

# SSG
make rebuild-ssg              # Regenerate SEO pages
make clean-ssg                # Remove dist/ssg*

# Database
make backup                   # Backup to ~/backups/textstack/
make backup-list              # List all backups
make restore FILE=path.gz     # Restore from backup

# Search
make reindex-search           # Rebuild search indexes

# Tests
dotnet test                   # All backend tests
pnpm -C apps/web test         # Frontend unit tests
pnpm -C apps/web test:e2e     # Playwright E2E

# Lint
dotnet format textstack.sln   # Backend

# Local dev (no Docker)
dotnet run --project backend/src/Api
pnpm -C apps/web dev          # http://localhost:5173
pnpm -C apps/admin dev        # http://localhost:81

# Migrations
dotnet ef migrations add <Name> --project backend/src/Infrastructure --startup-project backend/src/Api

# Mobile (apps/mobile)
npx expo start                # Dev server
npx expo run:ios              # Local iOS build
npx expo run:android          # Local Android build
```

---

## Deployment

```
Internet → Cloudflare (DNS + SSL) → Cloudflare Tunnel → nginx
  ├─ textstack.app → SSG static + /api/ proxy to :8080
  └─ textstack.dev → admin panel (:81)
```

SSG auto-rebuilds every 24h. Manual rebuild via admin panel or `make rebuild-ssg`.

---

## Docs

See [docs/](docs/) for architecture decisions, deployment guides, and API reference.

**Feature docs** (in `docs/05-features/`):
- [Reading Rooms](docs/05-features/reading-rooms.md) — social co-reading, shared highlights overlay, invite links
- [Vocabulary SRS](docs/05-features/vocabulary-srs.md) — spaced repetition, MC/typed/context modes, Ollama distractors
- [Reader](docs/05-features/reader.md) — Kindle-like reader internals
- [Offline Reading](docs/05-features/offline-reading.md) — PWA + IndexedDB caching
- [User Auth](docs/05-features/user-auth.md) — Google/Apple/email auth, guest flow
- [Search](docs/05-features/feat-0006-search-library.md) — Postgres FTS / Meilisearch
- [Text Extraction](docs/05-features/feat-0003-text-extraction-core.md) — EPUB/PDF/FB2 parsers
- [SSG Rebuild](docs/05-features/SSG_REBUILD.md) — Puppeteer prerender pipeline
- [Observability](docs/05-features/feat-0005-observability-opentelemetry.md) — OpenTelemetry + Aspire
