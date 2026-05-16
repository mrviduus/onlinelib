# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Free book library w/ Kindle-like reader. Upload EPUB/PDF/FB2 → parse → SEO pages + offline-first sync.

**Live**: [textstack.app](https://textstack.app/) (public) · [textstack.dev](https://textstack.dev/) (admin)

**Stack**: ASP.NET Core (API + Worker) + PostgreSQL + React + React Native (Expo)

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
make fix-permissions          # Fix volume permissions
make reindex-search           # Rebuild search indexes

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

# Mobile app (apps/mobile)
cd apps/mobile
npx expo start                    # Dev server (Expo Go — limited native modules)
npx expo run:ios                  # Local iOS build (requires Xcode)
npx expo run:android              # Local Android build (requires Android Studio)
npx tsc --noEmit                  # TypeScript check
npm run build:dev:ios             # EAS dev build (cloud, requires eas login)
npm run build:prod                # EAS production build
npm run submit:ios                # Submit to App Store
npm run submit:android            # Submit to Google Play
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

**Middleware pipeline** (order matters): `ForwardedHeaders` → `Cors` → `RateLimiter` → `ExceptionMiddleware` → `StaticFiles(/storage)` → `/health` → `SiteContext` → `LanguageContext` → `GuestActivity` (LastActiveAt debounce hourly) → `Routing` → `AdminAuth` (conditional on `/admin/*`)

**Site resolution**: Single-site now (ADR-007). `SiteContextMiddleware` still resolves host → SiteId. Dev mode: `?site=` query param override.

**Patterns**:
- Endpoints: `Map{Domain}Endpoints()` in `Api/Endpoints/`
- Test naming: `{Method}_{Scenario}_{Expected}`

### Frontend Architecture

**No Redux/Zustand** — React Context only. Provider hierarchy in `App.tsx`:
```
BrowserRouter → SiteProvider → AuthProvider → GuestLimitsProvider → NativeLanguageProvider → DownloadProvider → AppRoutes
  └─ /:lang/* → LanguageProvider → Header + page routes
```

- **SiteProvider**: Fetches `/api/site/context`, provides `site` to all children
- **AuthProvider**: Google Sign-In, email/password, Apple auth, auto-refresh token, skips Google for bots
- **GuestLimitsProvider**: Tracks guest usage limits (pages read, words saved) before requiring sign-up
- **NativeLanguageProvider**: User's native language for translations/definitions direction
- **DownloadProvider**: Offline reading — IndexedDB cache, download progress, resume
- **LanguageProvider**: Inside language routes only. Extracts `lang` from URL params, provides `switchLanguage()`, `getLocalizedPath()`

Context files: `apps/web/src/context/{Site,Auth,GuestLimits,NativeLanguage,Download,Language}Context.tsx`

**i18n**: JSON file in `apps/web/src/locales/en.json`. Hook: `useTranslation()`. Languages: `['en']`.

**Routing**: Language-prefixed routes (`/:lang/books`, `/:lang/authors`, etc). Root `/` → `/en`.

**API client**: `useApi()` hook → `createApi(language)` → methods like `getBooks()`, `getBook(slug)`. Uses `fetchJsonWithRetry()`.

**API client layer**: `apps/web/src/api/` — 9 modules: `client.ts` (base), `auth.ts`, `dictionary.ts`, `readingTracking.ts`, `translation.ts`, `tts.ts`, `userBooks.ts`, `userData.ts`, `vocabulary.ts`. `useApi()` hook wraps these.

**Hooks** (`apps/web/src/hooks/` — 47 hooks): Reader: `useReadingSession`, `useReadingProgress`, `useReaderKeyboard`, `useReaderNavigation`, `useReaderSettings`, `useReaderVocabulary`, `useScrollReader`, `useFullscreen`, `useFullscreenBars`, `useImmersiveMode`, `useAutoHideBar`, `useInBookSearch`, `useTextSelection`, `useDictionary`, `useTextTranslation`, `useWordTap`, `useDarkMode`. Library/data: `useLibrary`, `useBookmarks`, `useHighlights`, `useBookStats`, `useVocabulary`, `useVocabularyReview`, `useVocabLevel`, `useVocabDailyStats`, `useReadingStats`, `useReadingGoals`, `useAchievements`. UI: `useSwipe`, `useFocusTrap`, `useIsMobile`, `useScrolled`, `usePagination`, `useDebounce`, `useSoundEffects`, `useCardAnswer`, `useQuickStats`. Network: `useNetworkRecovery`, `useOfflineDownload`, `useGuestMigration`.

**Admin panel**: Separate React app (`apps/admin/`), English-only, JWT auth. Pages: Dashboard, Upload, User Uploads, Jobs queue, Editions list/edit, Authors CRUD, Genres CRUD, Chapter editor, SSG rebuild + job detail, Auto Publish, Tools, Settings.

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
- Metadata enrichment: `BookMetadataGenerator` (Worker) — Ollama fire-and-forget generates genre, year, description from title+author. Fields: Author, Genre, PublishedYear, TotalWordCount

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

**Dictionary**: `GET /dictionary/{lang}/{word}` — proxies Free Dictionary API. Used by web reader (phonetic + first-meaning definition) and by mobile vocabulary review (SRS card feedback only). Mobile **reader** no longer calls it as of 2026-05-15 — phonetic + inline definition removed from `WordCard`/`DictionarySheet` (sheet deleted) in favor of OpenAI Explain for the technical-reader audience, and to shrink Play Store Data Safety third-party processor list to OpenAI + Edge TTS only.

**Translation**: `POST /api/translate` via OpenAI (`gpt-5-mini`). Config: `OpenAI:ApiKey`, `OpenAI:Model`, `OpenAI:Translate:MaxTextLength`. LibreTranslate dropped 2026-04-22.

**Explain (contextual)**: `POST /api/explain` — LLM-powered 2-3 sentence explanation of a word in the sentence it appears in. Uses `ILlmService` (OpenAI `gpt-5-mini`). SHA256-keyed file cache at `data/explain-cache`, 30d TTL. Rate limited per-IP (20/min). Impl: `backend/src/Api/Endpoints/ExplainEndpoints.cs`.

**TTS (Text-to-Speech)**: Edge TTS via direct WebSocket to `speech.platform.bing.com`. No API key, no deps.
- **`TextStack.Tts`** class library: `EdgeTtsClient` (WebSocket protocol), `EdgeTtsService` (disk cache + `IHostedService` startup cleanup)
- **API**: `GET /api/tts?text=&lang=&voice=&speed=` → `audio/mpeg`, `GET /api/tts/voices?lang=` → voice list. No auth required
- **Two-layer cache**: server disk (`data/tts-cache/`, SHA256 key, 30d TTL, 1GB) + client IndexedDB (30d TTL)
- **Frontend**: `useTts()` hook → speak/stop/isPlaying. Used in vocabulary (word list + SRS cards) and reader (SelectionToolbar, DictionaryPopup, TranslationPopup)
- **Reader wiring**: `ReaderHighlights.tsx` orchestrates — passes `onSpeak` to toolbar/popups
- **Settings**: `ttsSpeed` in `useReaderSettings` (0.75x–2.0x), UI in `ReaderSettingsDrawer`
- **Voices**: `en-US-AriaNeural` (en), 200+ available for native-language TTS
- **Config**: `Tts:CachePath`, `Tts:MaxTextLength` (500), `Tts:TimeoutSeconds` (15). Docker: env `Tts__CachePath=/data/tts-cache`
- **Graceful degradation**: if disk cache unavailable (permissions), TTS still works without caching

**Vocabulary SRS**: Spaced repetition vocabulary builder integrated into the reader.
- **Entity**: `VocabularyWord` — word, translation, definition, sentence, bookTitle, distractors (JSON), hint (LLM-generated), SRS fields (stage, interval, consecutiveCorrect, nextReviewAt)
- **Review entity**: `VocabularyReview` — tracks each answer (isCorrect, responseTimeMs, reviewMode)
- **5 SRS stages**: New(0) → Recognition(1) → Recall(2) → Context(3) → Mastered(4). Logic in `Application/Vocabulary/SrsEngine.cs`
- **2 review modes**: `multiple_choice` (all stages, Blitz + Context Cloze), `classic` (flashcard with self-assessment). Typing mode removed.
- **MC distractors + hint + explanation**: Ollama LLM (`gemma4:e4b`) generates 5 distractors + hint + 2-3 sentence explanation (in native language) per word at save time. Stored in `Distractors` (JSON), `Hint` (varchar 500), `Explanation` (varchar 1000). Fallback: random words from user's vocab pool + hardcoded list. Generator: `Vocabulary/TextStack.Vocabulary/DistractorGenerator.cs`
- **Ollama**: Docker service (`ollama/ollama`), config: `Ollama:BaseUrl`, `Ollama:Model`, `Ollama:TimeoutSeconds` (default 30s). Fire-and-forget generation via `IServiceScopeFactory` after word save
- **MC fallback cascade**: definition → translation → blank sentence (if LLM distractors exist) → downgrade to context/typed_recall
- **Frontend**: `VocabularyPage.tsx` (word list, filters, search, stats), `VocabularyReviewPage.tsx` (review session), components in `components/vocabulary/`
- **API**: `POST /me/vocabulary/words` (save), `GET /me/vocabulary/words` (list), `DELETE /me/vocabulary/words/{id}`, `PUT /me/vocabulary/words/{id}`, `GET /me/vocabulary/review` (queue), `POST /me/vocabulary/review` (submit), `GET /me/vocabulary/stats`

**Guest Users**: Anonymous browsing with usage limits before sign-up required.
- GuestCleanupWorker purges inactive guests (6h interval)
- GuestLimitsContext tracks pages read, words saved
- GuestBanner prompts sign-up when limits approached
- Rate limiting: `guest-session` (5/min)
- Guest activity tracking middleware (LastActiveAt debounced hourly)

**Email/Password Auth**: Email + password login alongside Google/Apple OAuth.
- ResendEmailService for transactional email (password reset)
- PasswordResetToken entity, ResetPasswordPage frontend
- Config: Resend API key

**Export**: EPUB export of user highlights and notes.
- EpubExportService (`Application/Export/EpubExportService.cs`)
- ExportEndpoints (`Api/Endpoints/ExportEndpoints.cs`)
- **Deprecated 2026-04-15**: public book EPUB download (route `GET /{lang}/books/{slug}/export/epub` + UI anchor on `BookDetailPage`) hidden from UI; may be fully removed. Backend route + `EpubExportService` still live but unreachable from the app.

**Highlights Review**: Spaced review of saved highlights.
- HighlightReviewPage — review highlights with spaced repetition
- PracticePage — practice vocabulary and highlights

**Auto Publish**: Automated pipeline for publishing Draft books with SEO content.
- Admin page at `/autopublish` — settings, candidates, jobs history
- `seo-publish-poll.sh` (systemd) polls DB every 60s for queued jobs
- `seo-generate.sh` calls Claude CLI (`claude-sonnet-4-6`) to generate SEO fields (description, relevance, themes, FAQs)
- Publishes via `POST /internal/editions/{id}/publish` (Docker network only)
- Settings: books/day, hour UTC, require review, language filter, priority queue
- Auto-triggers Specific SSG rebuild per published book via `PublishEditionAsync() → EnqueueSsgSafe()`

**SEO Backfill**: Template-driven SEO field generation for Authors, Editions, Genres.
- Admin page at `/seo-backfill` — Coverage, Templates, Jobs, Settings tabs
- Entities: `SeoTemplate` (admin-editable prompts, versioned), `SeoBackfillJob` (queue + Before/After snapshots), `SeoBackfillSettings` (singleton)
- `SeoSource` column on Author/Edition/Genre: `manual` | `auto` | `hybrid` — `manual` rows protected from overwrite
- Progressive trust: `TrustLevel` per template — `Manual` (queue by admin only) → `Review` (needs approval) → `Auto` (direct apply). Strictest wins for multi-field jobs
- `seo-backfill-poll.sh` (systemd) claims jobs atomically via `FOR UPDATE SKIP LOCKED`, dispatches per-job
- `seo-backfill-generate.sh` — GET context → Claude CLI per field (3 retries with error feedback) → POST apply; output validated vs per-field JSON schema
- Prompt injection defense: `SeoPromptSanitizer` strips `{{`, `}}`, `assistant:`, `system:`, `</prompt>`, `<|…|>` from entity text before template interpolation
- Immutable replay: job stores `TemplateIds[]` + `TemplateVersions[]` — editing a template creates a new version, old jobs keep their frozen snapshot
- Revert: restores `BeforeSnapshot`, flips `SeoSource` back to `manual`. **No TTL** — revert allowed at any age (snapshot is an immutable audit record)
- Internal endpoints `/internal/seo/{enabled,jobs/claim,jobs/{id}/context,jobs/{id}/apply,jobs/{id}/fail}` (Docker network only)
- Failure alerts: admin email via Resend on any failed job (config `Resend:AdminAlertEmail`, no-op if empty)
- Seed templates: EN + UK variants for Author (Bio/Relevance/Themes/Faqs/SeoTitle/SeoDescription), Edition (Description/Relevance/Themes/Faqs/SeoTitle/SeoDescription), Genre (Description/SeoTitle/SeoDescription — en only)
- Setup: `make seo-backfill-setup` (systemd user unit), `make seo-backfill-restart`, `make seo-backfill-logs`

**SSG**: Puppeteer prerenders SEO pages to static HTML
- nginx serves SSG first, falls back to SPA
- Run `make rebuild-ssg` after content changes
- SSG worker: separate always-running container polling DB every 5s. Supports IndexNow (Bing/Yandex) via `INDEXNOW_KEY`
- Periodic rebuild: configurable from admin panel (SSG Rebuild → Settings: enable/disable, interval hours)

**When to rebuild SSG**:
- After adding/publishing new books
- After updating book metadata
- After adding/updating authors or genres
- NOT needed for: reading progress, bookmarks, user data

## API Endpoints

**Public**: `GET /books`, `/books/{slug}`, `/authors`, `/genres`, `/search?q=`, `/seo/*`, `/dictionary/{lang}/{word}`, `POST /translate`, `GET /api/tts?text=&lang=&voice=&speed=`, `GET /api/tts/voices?lang=`

**Auth**: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`

**Profile**: `GET/PUT /me/profile`

**User**: `GET/POST /me/library`, `/me/progress/{editionId}` (GET/PUT/DELETE), `/me/bookmarks`, `/me/highlights/{editionId}`

**Export**: `GET /me/export/epub`

**Reading Tracking**: `POST /me/reading/sessions`, `GET /me/reading/sessions`, `GET /me/reading/stats`, `GET /me/reading/stats/daily`, `GET/POST /me/reading/goals`, `DELETE /me/reading/goals/{id}`, `GET /me/reading/achievements`

**User Books**: `POST /me/books/upload`, `GET /me/books`, `GET /me/books/quota`, `GET /me/books/{id}`, `GET /me/books/{id}/chapters/{slug}`, `GET/PUT /me/books/{id}/progress`, `GET/POST/DELETE /me/books/{id}/bookmarks`, `POST /me/books/{id}/retry`, `DELETE /me/books/{id}`

**Vocabulary**: `POST /me/vocabulary/words`, `GET /me/vocabulary/words?filter=&sort=&search=&limit=&offset=`, `PUT /me/vocabulary/words/{id}`, `DELETE /me/vocabulary/words/{id}`, `GET /me/vocabulary/review?limit=`, `POST /me/vocabulary/review`, `GET /me/vocabulary/stats`

**Admin**: `POST /admin/books/upload`, `/admin/import/textstack`, `/admin/reimport/textstack`, `/admin/sync/standardebooks`, `/admin/reprocess/{editionId}`, `/admin/reprocess/all`, `GET /admin/ingestion/jobs`, `/admin/ingestion/jobs/{id}/retry`, `/admin/ingestion/jobs/{id}/preview`, `/admin/chapters/{id}` (GET/PUT/DELETE), `/admin/settings`, `/admin/ssg-rebuild`, `/admin/ssg/settings` (GET/PUT), `/admin/lint`, CRUD for `/admin/authors`, `/admin/genres`

**Auto Publish Admin**: `GET/PUT /admin/autopublish/settings`, `GET /admin/autopublish/jobs`, `GET /admin/autopublish/jobs/{id}`, `POST /admin/autopublish/jobs/{id}/approve`, `POST /admin/autopublish/jobs/{id}/reject`, `POST /admin/autopublish/jobs/{id}/retry`, `POST /admin/autopublish/trigger`, `POST /admin/autopublish/queue/{editionId}`, `GET /admin/autopublish/candidates`

**SEO Backfill Admin**: `GET /admin/seo/coverage`, `GET /admin/seo/gaps?entityType=&limit=`, `GET/PUT /admin/seo/settings`, `GET /admin/seo/templates`, `GET /admin/seo/templates/{id}`, `POST /admin/seo/templates`, `PUT /admin/seo/templates/{id}` (creates new Version), `POST /admin/seo/templates/{id}/deactivate`, `POST /admin/seo/templates/preview`, `GET /admin/seo/jobs`, `GET /admin/seo/jobs/{id}`, `POST /admin/seo/jobs/{id}/approve`, `POST /admin/seo/jobs/{id}/revert`, `POST /admin/seo/jobs/{id}/retry`, `POST /admin/seo/queue`

**Internal**: `POST /internal/editions/{id}/publish`, `POST /internal/ssg/rebuild-all`, `POST /internal/seo/jobs/claim?limit=`, `GET /internal/seo/jobs/{id}/context`, `POST /internal/seo/jobs/{id}/apply`, `POST /internal/seo/jobs/{id}/fail` (Docker network only)

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
| i18n | `apps/web/src/locales/en.json` |
| Admin | `apps/admin/src/pages/` |
| Stats | `apps/web/src/pages/StatsPage.tsx` |
| Reading Hooks | `apps/web/src/hooks/useReadingSession.ts` |
| Achievements | `backend/src/Application/ReadingTracking/AchievementChecker.cs` |
| Vocabulary API | `backend/src/Api/Endpoints/VocabularyEndpoints.cs` |
| Vocabulary SRS | `backend/src/Application/Vocabulary/SrsEngine.cs` |
| Distractor Gen | `backend/src/Api/Endpoints/DistractorGenerator.cs` |
| Vocabulary Page | `apps/web/src/pages/VocabularyPage.tsx` |
| Vocab Review | `apps/web/src/pages/VocabularyReviewPage.tsx` |
| Vocab Components | `apps/web/src/components/vocabulary/` |
| Vocab Hooks | `apps/web/src/hooks/useVocabulary.ts`, `useVocabularyReview.ts` |
| Vocab E2E | `apps/web/e2e/tests/vocabulary.spec.ts` |
| TTS Library | `backend/src/Tts/TextStack.Tts/` (EdgeTtsClient, EdgeTtsService, ITtsService) |
| TTS API | `backend/src/Api/Endpoints/TtsEndpoints.cs` |
| TTS Hook | `apps/web/src/hooks/useTts.ts` |
| TTS E2E | `apps/web/e2e/tests/tts.spec.ts` |
| Meilisearch | `backend/src/Search/TextStack.Search.Meilisearch/` |
| FB2 Extractor | `backend/src/Extraction/TextStack.Extraction/Extractors/Fb2TextExtractor.cs` |
| Book Metadata | `backend/src/Worker/Services/BookMetadataGenerator.cs` |
| Auto Publish API | `backend/src/Api/Endpoints/AdminAutoPublishEndpoints.cs` |
| Auto Publish Entity | `backend/src/Domain/Entities/AutoPublishJob.cs` |
| Auto Publish Admin | `apps/admin/src/pages/AutoPublishPage.tsx` |
| SEO Generate Script | `infra/scripts/seo-generate.sh` |
| SEO Publish Poller | `infra/scripts/seo-publish-poll.sh` |
| SEO Backfill Admin API | `backend/src/Api/Endpoints/AdminSeoBackfillEndpoints.cs` |
| SEO Backfill Internal API | `backend/src/Api/Endpoints/InternalSeoEndpoints.cs` |
| SEO Backfill Services | `backend/src/Application/Seo/` (JobProcessor, ContextBuilder, ContentApplier, CoverageAnalyzer, TemplateRenderer, ContentValidator, PromptSanitizer) |
| SEO Backfill Entities | `backend/src/Domain/Entities/SeoTemplate.cs`, `SeoBackfillJob.cs`, `SeoBackfillSettings.cs` |
| SEO Backfill Poller | `infra/scripts/seo-backfill-poll.sh`, `infra/scripts/seo-backfill-generate.sh` |
| SEO Backfill systemd | `infra/systemd/seo-backfill-poller.service` |
| SEO Backfill Admin UI | `apps/admin/src/pages/SeoBackfillPage.tsx` |
| Internal Endpoints | `backend/src/Api/Endpoints/InternalEndpoints.cs` |
| SSG Periodic Worker | `backend/src/Api/Services/SsgPeriodicRebuildWorker.cs` |
| SSG | `apps/web/scripts/prerender.mjs` |
| nginx config | `infra/nginx/textstack.conf` |
| Export | `backend/src/Application/Export/EpubExportService.cs` |
| Export API | `backend/src/Api/Endpoints/ExportEndpoints.cs` |
| Profile API | `backend/src/Api/Endpoints/ProfileEndpoints.cs` |
| Guest Context | `apps/web/src/context/GuestLimitsContext.tsx` |
| Native Lang Context | `apps/web/src/context/NativeLanguageContext.tsx` |
| Email Service | `backend/src/Infrastructure/Services/ResendEmailService.cs` |
| Guest Cleanup | `backend/src/Worker/Services/GuestCleanupWorker.cs` |
| Highlights Page | `apps/web/src/pages/HighlightsPage.tsx` |
| Practice Page | `apps/web/src/pages/PracticePage.tsx` |
| Mobile App | `apps/mobile/app/` (Expo Router pages) |
| Mobile API | `apps/mobile/src/lib/api.ts` |
| Mobile Contexts | `apps/mobile/src/context/` |
| Mobile E2E | `apps/mobile/e2e/` |
| CI Workflow | `.github/workflows/ci.yml` |
| Deploy Workflow | `.github/workflows/deploy.yml` |
| Backup Workflow | `.github/workflows/backup.yml` |
| Health Check | `.github/workflows/health-check.yml` |

## Search

Two providers, swappable via `SEARCH_PROVIDER` env var (default: `postgres`):
- **PostgreSQL FTS**: Raw SQL (Dapper) in `TextStack.Search/Providers/PostgresFts/PostgresSearchProvider.cs`
- **Meilisearch** (optional): `TextStack.Search.Meilisearch/`. Not in default compose — add service manually if used

Reindex: `make reindex-search`

After schema changes:
1. Update the relevant search provider
2. Run `dotnet test tests/TextStack.IntegrationTests --filter SearchEndpoint`
3. Test: `https://textstack.app/en/search?q=test`

## Test Projects

```
tests/
├── TextStack.UnitTests/           # Pure logic, no DB
├── TextStack.IntegrationTests/    # API tests against running server (LiveApiFixture → localhost:8080, override via API_URL env)
├── TextStack.Extraction.Tests/    # Book parsing (EPUB/PDF/FB2)
├── TextStack.Search.Tests/        # Search logic
apps/web/e2e/                      # Playwright E2E (chromium, mobile, admin projects) — 11 specs
apps/mobile/e2e/                   # Mobile Playwright E2E — 16 specs
```

Test naming convention: `{MethodName}_{Scenario}_{ExpectedResult}`

**E2E setup**: Global setup authenticates test user + admin, discovers books from API → `.test-data.json`. Auth state stored in `apps/web/e2e/.auth/`. Page object helpers in `apps/web/e2e/helpers/`.

**Test env vars**:
- `ENABLE_TEST_AUTH=true` — enables test auth endpoints (needed for integration + E2E)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — needed for admin E2E
- Integration tests set `Host` header: `general.localhost` (public), `textstack.dev` (admin)

**Vocabulary E2E tests** (`apps/web/e2e/tests/vocabulary.spec.ts`): Serial test suite covering main SRS flows:
- `page loads empty for new user` — clean slate, verify empty state renders
- `save words via API, page shows them` — save 5 test words, verify they appear in word list
- `filter tabs work` — New/Learning/Mastered tabs filter correctly
- `search filters words` — typing in search box filters word list
- `start review → MC card renders` — starts review session, verifies MC card with 4 options
- `correct MC answer → green feedback` — answer MC card, verify feedback renders
- `complete session → summary screen` — answer all cards, verify summary with stats
- `back to vocabulary from summary` — navigate back from summary
- `expand word shows details` — click word row, verify detail panel
- `delete word removes it` — expand word, delete, verify count decreases
- Helper: `apps/web/e2e/helpers/vocabulary.ts` — `saveTestWords()`, `deleteAllTestWords()`, `TEST_WORDS[]`

### Mobile App Architecture

**Framework**: Expo 55, React Native 0.83.2, Expo Router (file-based routing).

**Pages** (`apps/mobile/app/`): 27 screens — tabs (home, search, library, profile), auth, book detail, reader, highlights + review, stats, vocabulary + review, user book upload/read.

**Contexts** (`apps/mobile/src/context/`): AuthContext, DownloadContext, LanguageContext, NativeLanguageContext, ThemeContext.

**Hooks** (`apps/mobile/src/hooks/`): useCardAnswer, useHaptics, useQuickStats, useReaderSettings, useReadingSession, useTts, useVocabularyReview.

**API**: Single `apps/mobile/src/lib/api.ts` module (consolidated, not split like web).

**E2E**: 15 Playwright specs in `apps/mobile/e2e/` — navigation, books, search, library, vocabulary, highlights, stats, auth.

**Build**: EAS Build (cloud) for dev/prod. OTA updates via `expo-updates`.

### Releasing to Play Internal Testing

```bash
cd apps/mobile
eas build -p android --profile production --auto-submit
```

That single command builds the AAB and pushes it to Internal Testing. Service account credentials live in EAS secret `GOOGLE_SERVICE_ACCOUNT_KEY` (mirror at `apps/mobile/google-service-account.json` locally, gitignored). Service account email: `eas-submit-textstack@orbital-heaven-496518-t5.iam.gserviceaccount.com`. Permission granted: "Release apps to testing tracks" for the TextStack app.

## CI/CD

**GitHub Actions workflows** (`.github/workflows/`):
- **ci.yml** — runs on PR + push to main. Jobs: backend (build, lint, migrations, search tests), frontend (web + admin build), docker (integration tests), e2e (Playwright)
- **deploy.yml** — self-hosted runner on server. Pre-deploy backup → git pull → frontend build → docker compose up → health checks → SSG rebuild queue → image cleanup
- **backup.yml** — daily at 3 AM UTC. DB dump + storage tar.gz, keeps 5 newest of each
- **health-check.yml** — every 5 min. Checks API + both frontends

## Deployment

```
Internet → Cloudflare (DNS+SSL) → Cloudflare Tunnel → nginx (port 80)
  ├─ textstack.app → SSG static files + /api/ proxy to :8080
  └─ textstack.dev → admin panel (:81)
```

Docker services: `db` (postgres:16), `migrator`, `api`, `worker`, `admin`, `ssg-worker`, `aspire-dashboard` (profile-gated), `ollama`. All localhost-only, no public ports except 80 via tunnel.

**Nginx bot detection**: Regex map identifies crawlers (Google, Bing, Yandex, social bots) → routes to prerendered SSG HTML. Rate limiting zones: API (10r/s), uploads (1r/s), translation (5r/m).

**Systemd services**: `seo-publish-poller` (auto-publish with SEO generation).

**Notable env vars** (beyond `.env.example` basics): `SEARCH_PROVIDER=postgres` (or `meilisearch` if running a Meilisearch container manually), `INDEXNOW_KEY`, `INDEXNOW_ENABLED`.

## Extraction Pipeline

Supported formats: EPUB, PDF, FB2. Processing order: Spelling → Hyphenation → Typography → Semantic → Linter. Details in `backend/src/Extraction/TextStack.Extraction/RULES.md`. ARM64 caveat: uses compiled `Regex` not `[GeneratedRegex]` (SIGILL bug).

FB2 (`Fb2TextExtractor`): XML-based FictionBook 2.0. Cover from binary elements, metadata extraction, chapter flattening, namespace detection for non-compliant files.

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
