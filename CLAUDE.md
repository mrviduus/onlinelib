# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first sync.

**Live**: [textstack.app](https://textstack.app/) (public) · [textstack.dev](https://textstack.dev/) (admin)

**Stack**: ASP.NET Core (API + Worker) + PostgreSQL + React

**Prerequisites**: Docker, .NET 10 SDK, Node.js 18+, pnpm

**CI/CD**: Push to `main` → auto-deploy. SSG rebuild: admin panel or `make rebuild-ssg`.

## Commands

```bash
# Setup (one-time)
cp .env.example .env          # Edit with real values
make nginx-setup              # Install nginx config (Linux)
make nginx-setup-mac          # Mac
make up                       # Start services

# Docker
make up / down / restart / logs / status
make build                    # docker compose up -d --build
make rebuild                  # full rebuild --no-cache
make clean-ssg                # remove dist/ssg*

# Deploy
make deploy                   # Full deploy (pull, build, restart, SSG)
make rebuild-ssg              # Rebuild SSG pages only

# Database
make backup                   # Backup to ~/backups/textstack/
make backup-list              # List all backups
make restore FILE=path.gz     # Restore from backup
docker compose exec db psql -U app books   # DB shell
docker compose down -v                      # Reset all (loses data)

# Tests
dotnet test                                 # All tests
dotnet test tests/TextStack.UnitTests
dotnet test tests/TextStack.IntegrationTests
dotnet test tests/TextStack.Extraction.Tests
dotnet test tests/TextStack.Search.Tests
dotnet test --filter "Name~TestMethodName"  # Single test
pnpm -C apps/web test                       # Frontend unit tests (Vitest)
pnpm -C apps/web test:watch                 # Watch mode
pnpm -C apps/web test:e2e                   # Playwright E2E (headless)
pnpm -C apps/web test:e2e:ui                # Playwright E2E (UI mode)

# Lint
dotnet format textstack.sln                  # Backend

# CLI commands (via dotnet run --project backend/src/Api --)
# create-admin <email> <password> [role]
# optimize-images [--dry-run]
# import-textstack <book-path>

# Local dev (no Docker)
dotnet run --project backend/src/Api
dotnet run --project backend/src/Worker
pnpm -C apps/web dev          # http://localhost:5173
pnpm -C apps/admin dev        # http://localhost:81

# Build
pnpm -C apps/web build
pnpm -C apps/admin build

# Migrations
dotnet ef migrations add <Name> --project backend/src/Infrastructure --startup-project backend/src/Api
MIGRATE_TARGET=0 docker compose up migrator   # Rollback all migrations
```

| Service | Local | Prod |
|---------|-------|------|
| Web | http://localhost:5173 | https://textstack.app |
| API | http://localhost:8080 | https://textstack.app/api |
| API Docs | http://localhost:8080/scalar/v1 | — |
| Admin | http://localhost:81 | https://textstack.dev |
| Aspire | http://127.0.0.1:18888 | — |

**Storage**: Files at `./data/storage/books/{editionId}/` (originals + derived covers).

## Architecture

```
API → Application → Domain ← Infrastructure
                      ↑
                   Worker
```

- **Domain**: Pure C#, no framework deps
- **Application**: Business logic, interfaces (`IAppDbContext`, `IFileStorageService`)
- **Contracts**: Shared DTOs (request/response models) used by API and Application
- **Infrastructure**: EF Core (snake_case naming), storage implementations
- **API/Worker**: Orchestration, DI

**Middleware pipeline** (order matters): `ForwardedHeaders` → `Cors` → `RateLimiter` → `ExceptionMiddleware` → `StaticFiles(/storage)` → `/health` → `SiteContext` → `LanguageContext` → `Routing` → `AdminAuth` (conditional on `/admin/*`)

**Site resolution**: Single-site now (ADR-007). `SiteContextMiddleware` still resolves host → SiteId. Dev mode: `?site=` query param override.

**Patterns**:
- Endpoints: `Map{Domain}Endpoints()` in `Api/Endpoints/`
- Test naming: `{Method}_{Scenario}_{Expected}`

### Frontend Architecture

**No Redux/Zustand** — React Context only. Provider hierarchy in `App.tsx`:
```
BrowserRouter → SiteProvider → AuthProvider → DownloadProvider → AppRoutes
  └─ /:lang/* → LanguageProvider → Header + page routes
```

- **SiteProvider**: Fetches `/api/site/context`, provides `site` to all children
- **AuthProvider**: Google Sign-In, auto-refresh token, skips Google for bots
- **DownloadProvider**: Offline reading — IndexedDB cache, download progress, resume
- **LanguageProvider**: Inside language routes only. Extracts `lang` from URL params, provides `switchLanguage()`, `getLocalizedPath()`

Context files: `apps/web/src/context/{Site,Auth,Download,Language}Context.tsx`

**i18n**: JSON files in `apps/web/src/locales/{en,uk}.json`. Hook: `useTranslation()`. Languages: `['en', 'uk']`.

**Routing**: Language-prefixed routes (`/:lang/books`, `/:lang/authors`, etc). Root `/` → `/en`.

**API client**: `useApi()` hook → `createApi(language)` → methods like `getBooks()`, `getBook(slug)`. Uses `fetchJsonWithRetry()`.

**API client layer**: `apps/web/src/api/` — separate modules per domain: `client.ts` (base), `auth.ts`, `readingTracking.ts`, `userData.ts`, `userBooks.ts`, `dictionary.ts`, `translation.ts`. `useApi()` hook wraps these.

**Reader hooks** (`apps/web/src/hooks/`): Reading session tracking (`useReadingSession`), progress sync (`useReadingProgress`), fullscreen (`useFullscreen`, `useImmersiveMode`), keyboard nav (`useReaderKeyboard`), in-book search (`useInBookSearch`), text selection (`useTextSelection`, `useDictionary`, `useTextTranslation`), dark mode (`useReaderSettings`, `useDarkMode`).

**Admin panel**: Separate React app (`apps/admin/`), English-only, JWT auth. Pages: Dashboard, Upload, Jobs queue, Editions list/edit, Authors CRUD, Genres CRUD, Chapter editor, SSG rebuild, SEO crawl, Tools, Settings.

## Key Concepts

**Entity Hierarchy**: Site → Work → Edition → Chapter
- Work = canonical book (just slug), Edition = per-language version with metadata
- Edition contains: title, description, cover_path, SEO fields
- Edition ↔ Author via EditionAuthor (M2M), Edition → Genre (FK)
- Chapter contains: html (rendered), plain_text (search), search_vector (FTS)

**User Books**: Users can upload their own books (separate from admin library).
- UserBook → UserChapter (parallel to Work/Edition/Chapter but per-user)
- Upload flow: UserBookFile → UserIngestionJob → Worker extracts chapters
- Pages: `/:lang/library/my/:id` (detail), `/:lang/library/my/:id/read/:chapterSlug` (reader with `mode="userbook"`)

**Book Upload Flow**:
```
Upload EPUB/PDF/FB2 → BookFile (stored) → IngestionJob (queued)
     → Worker polls → Extraction → Chapters created → search_vector indexed
```

**Reading Stats**: Full reading analytics system.
- ReadingSession — tracks duration, words read, start/end percent per reading session
- ReadingGoal — daily_minutes or books_per_year targets with streak tracking
- UserAchievement — 20 achievements across milestone/streak/time/special categories
- AchievementChecker (`Application/ReadingTracking/AchievementChecker.cs`) runs after each session
- Frontend: StatsPage with heatmap calendar, weekly chart, goals, achievements grid
- Session tracking: 30s heartbeat, 3min idle threshold, 5min auto-end, localStorage queue, sendBeacon submit

**Dictionary**: `GET /dictionary/{lang}/{word}` — proxies Free Dictionary API.

**Translation**: `POST /translate` via LibreTranslate container. Config: `LibreTranslate:BaseUrl`, `LibreTranslate:TimeoutSeconds`, `LibreTranslate:MaxTextLength`.

**SSG**: Puppeteer prerenders SEO pages to static HTML
- nginx serves SSG first, falls back to SPA
- Run `make rebuild-ssg` after content changes
- SSG worker: separate always-running container polling DB every 5s. Supports IndexNow (Bing/Yandex) via `INDEXNOW_KEY`

**When to rebuild SSG**:
- After adding/publishing new books
- After updating book metadata
- After adding/updating authors or genres
- NOT needed for: reading progress, bookmarks, user data

## API Endpoints

**Public**: `GET /books`, `/books/{slug}`, `/authors`, `/genres`, `/search?q=`, `/seo/*`, `/dictionary/{lang}/{word}`, `POST /translate`

**Auth**: `POST /auth/login`, `/auth/refresh`, `/auth/logout`

**User**: `GET/POST /me/library`, `/me/progress/{editionId}` (GET/PUT/DELETE), `/me/bookmarks`, `/me/highlights/{editionId}`

**Reading Tracking**: `POST /me/reading/sessions`, `GET /me/reading/sessions`, `GET /me/reading/stats`, `GET /me/reading/stats/daily`, `GET/POST /me/reading/goals`, `DELETE /me/reading/goals/{id}`, `GET /me/reading/achievements`

**User Books**: `POST /me/books/upload`, `GET /me/books`, `GET /me/books/quota`, `GET /me/books/{id}`, `GET /me/books/{id}/chapters/{slug}`, `GET/PUT /me/books/{id}/progress`, `GET/POST/DELETE /me/books/{id}/bookmarks`, `POST /me/books/{id}/retry`, `DELETE /me/books/{id}`

**Admin**: `POST /admin/books/upload`, `/admin/import/textstack`, `/admin/reimport/textstack`, `/admin/sync/standardebooks`, `/admin/reprocess/{editionId}`, `/admin/reprocess/all`, `GET /admin/ingestion/jobs`, `/admin/ingestion/jobs/{id}/retry`, `/admin/ingestion/jobs/{id}/preview`, `/admin/chapters/{id}` (GET/PUT/DELETE), `/admin/settings`, `/admin/ssg-rebuild`, `/admin/seo-crawl`, `/admin/lint`, CRUD for `/admin/authors`, `/admin/genres`

## Key Files

| Area | Path |
|------|------|
| Domain | `backend/src/Domain/Entities/` |
| Application | `backend/src/Application/` (services, interfaces) |
| API Endpoints | `backend/src/Api/Endpoints/` |
| API Middleware | `backend/src/Api/Middleware/` |
| API Entry | `backend/src/Api/Program.cs` |
| Worker | `backend/src/Worker/Services/IngestionWorkerService.cs` |
| Extraction | `backend/src/Extraction/` (EPUB/PDF/FB2 parsers) |
| Search | `backend/src/Search/TextStack.Search/Providers/PostgresFts/PostgresSearchProvider.cs` |
| DB Context | `backend/src/Infrastructure/Persistence/AppDbContext.cs` |
| Web Contexts | `apps/web/src/context/` |
| Web Pages | `apps/web/src/pages/` |
| Reader | `apps/web/src/pages/ReaderPage.tsx` |
| Library | `apps/web/src/pages/LibraryPage.tsx` |
| API Hook | `apps/web/src/hooks/useApi.ts` |
| i18n | `apps/web/src/locales/{en,uk}.json` |
| Admin | `apps/admin/src/pages/` |
| Stats | `apps/web/src/pages/StatsPage.tsx` |
| Reading Hooks | `apps/web/src/hooks/useReadingSession.ts` |
| Achievements | `backend/src/Application/ReadingTracking/AchievementChecker.cs` |
| SSG | `apps/web/scripts/prerender.mjs` |
| nginx config | `infra/nginx/textstack.conf` |

## Search

Search uses raw SQL (Dapper). After schema changes:
1. Update `backend/src/Search/TextStack.Search/Providers/PostgresFts/PostgresSearchProvider.cs`
2. Run `dotnet test tests/TextStack.IntegrationTests --filter SearchEndpoint`
3. Test: `https://textstack.app/en/search?q=test`

## Test Projects

```
tests/
├── TextStack.UnitTests/           # Pure logic, no DB
├── TextStack.IntegrationTests/    # API tests against running server (LiveApiFixture → localhost:8080, override via API_URL env)
├── TextStack.Extraction.Tests/    # Book parsing (EPUB/PDF/FB2)
├── TextStack.Search.Tests/        # Search logic
apps/web/e2e/                      # Playwright E2E (chromium, mobile, admin projects)
```

Test naming convention: `{MethodName}_{Scenario}_{ExpectedResult}`

**E2E setup**: Global setup authenticates test user + admin, discovers books from API → `.test-data.json`. Auth state stored in `apps/web/e2e/.auth/`. Page object helpers in `apps/web/e2e/helpers/`.

**Test env vars**:
- `ENABLE_TEST_AUTH=true` — enables test auth endpoints (needed for integration + E2E)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — needed for admin E2E
- Integration tests set `Host` header: `general.localhost` (public), `textstack.dev` (admin)

## Deployment

```
Internet → Cloudflare (DNS+SSL) → Cloudflare Tunnel → nginx (port 80)
  ├─ textstack.app → SSG static files + /api/ proxy to :8080
  └─ textstack.dev → admin panel (:81)
```

Docker services: `db` (postgres:16), `migrator`, `api`, `worker`, `admin`, `ssg-worker`, `aspire-dashboard`, `libretranslate`. All localhost-only, no public ports except 80 via tunnel.

## Extraction Pipeline

Processing order: Spelling → Hyphenation → Typography → Semantic → Linter. Details in `backend/src/Extraction/TextStack.Extraction/RULES.md`. ARM64 caveat: uses compiled `Regex` not `[GeneratedRegex]` (SIGILL bug).

## Telemetry

OpenTelemetry → Aspire Dashboard (`localhost:18888`). OTLP: `:18889`. Services: `textstack-api`, `textstack-worker`.

## Package Management

Central versioning via `Directory.Packages.props` — don't add `<Version>` in individual csproj files. Target: `net10.0` (set in `Directory.Build.props`).

## Verifying SSG

After content changes, verify SSG is serving correctly:
```bash
# Check header indicates SSG (not SPA fallback)
curl -I https://textstack.app/en/books/dracula/ | grep X-SEO-Render
# Expected: X-SEO-Render: ssg

# Check SPA routes still work
curl -I https://textstack.app/en/search | grep X-SEO-Render
# Expected: X-SEO-Render: spa
```
