# Changelog

## [Unreleased]

### Vocabulary Review Overhaul (2026-04-06)
- **Blitz + Classic modes** — segmented control on Practice page, Blitz (MC cards) and Classic (3D flip flashcards with self-assessment)
- **Classic Flashcards** — CSS 3D flip animation, self-assessment buttons (Forgot/Almost/Knew), maps to SRS isCorrect
- **New Word intro card** — shown for stage=0 words before quiz: word, sentence, translation, AI explanation
- **AI explanation** — Ollama generates 2-3 sentence explanation in native language when word saved, shown on NewWordCard
- **Sound effects** — Web Audio API synthesized sounds (correct/wrong/flip/complete), toggle in review header
- **Session summary redesign** — reward banner (4 tiers), stats row, action buttons
- **Practice page redesign** — removed emoji icons, Apple-like card sections, mode selector
- **Dark mode fix** — replaced undefined CSS vars (`--color-surface`, `--color-hover`) with proper theme vars
- **Removed typing mode** — ContextCard deleted, context cloze now uses MC (backend returns `multiple_choice`)
- **Ollama model upgrade** — switched from `gemma3:4b` to `qwen3:8b` for better multilingual quality

### Auto Publish — Automated Book Publishing Pipeline (2026-04-02)
- **Auto-publish admin page** — configurable pipeline: Draft → SEO generation → publish, fully managed from admin panel
- **SEO generation via Claude CLI** — `seo-generate.sh` calls `claude-sonnet-4-6` to generate description, relevance, themes, FAQs for editions and authors
- **Polling daemon** — `seo-publish-poll.sh` (systemd) polls DB every 60s, processes queued jobs
- **Settings** — books/day (1–10), hour UTC, require review gate, language filter, enable/disable toggle
- **Priority queue** — admin can queue specific editions with priority, processed first regardless of schedule
- **Candidates view** — shows Draft editions ready to publish with SEO readiness indicators (D/R/T/F)
- **Internal publish endpoint** — `POST /internal/editions/{id}/publish` (Docker network only), triggers SSG automatically
- **SSG periodic rebuild settings** — moved from `appsettings.json` to admin panel (enable/disable, interval hours)
- **Integration tests** — 10 auth tests for all admin autopublish endpoints

### Admin Improvements (2026-04-01)
- **Publish/unpublish buttons** on author detail page
- **SEO readiness filter + badge** for editions & authors lists
- **Dashboard** — live stats, recent jobs, blog metrics
- **Default og:image fallback** for pages without cover

### User Features (2026-03-28)
- **Email/password auth** — register, login, forgot password flow
- **User profile** — avatar upload + name edit
- **Vocabulary fix** — typed recall mode no longer requires exact word typing
- **Selection toolbar fix** — word selection works correctly in reader

### Mobile App (2026-03-25)
- **Full PWA parity** — shared API refactor, offline reading, progress sync
- **Top bar fix** — render after WebView so icons visible
- **User book reader fix** — missing slug param in appendChapter

### CodeGen — AI Code Generation (2026-03-22)
- **CodeGen admin page** — describe a task, Claude Code implements it in iterative loop (Ralph pattern), creates PR
- **PDD auto-generation** — each job creates a Product Design Doc in `docs/05-features/codegen-{id}.md` on first iteration
- **Host-based execution** — uses Claude Code CLI with Max subscription (OAuth), runs on host via `codegen-poll.sh`
- **Rerun support** — restart terminal jobs with clean state
- **Hardening** — input validation, timeouts, double-click guard, branch checkout verification
- **Mobile-responsive admin** — hamburger menu, off-canvas sidebar, responsive tables/forms for all admin pages

### Vocabulary
- **Vocab review card** removed from homepage
- **Dark mode fix** — vocab review button invisible in dark mode
- **Button overflow fix** — vocab review card button on narrow screens

### SSG / SEO — Critical Fix (2026-03-12)
- **Fix: SSG saved error pages as permanent static files** — if API failed during prerender (timeout, 499), broken HTML with `noindex` was saved and served to Google. Now skips saving pages with `noindex` meta tag
- **Fix: detail pages treated all errors as 404** — created `errorUtils.ts` with `isNotFoundError()`. Only real HTTP 404 gets `noindex`; transient errors (499, timeout) no longer add `noindex`
- **Fix: Google JS hydration overwrites SSG** — strip `<script type="module">` and `<link rel="modulepreload">` from SSG output so Googlebot can't re-execute React
- **Fix: SSG worker blocked by AllowedHosts** — added Docker hostname `api` to `AllowedHosts` in `appsettings.json`
- **Fix: nginx served SSG to all users** — `if ($is_bot)` inside regex location broken ("if is evil"). Replaced with `map $is_bot $ssg_file` + `try_files` — bots get SSG, real users get SPA
- **Fix: Google Live Test got SPA instead of SSG** — `Google-InspectionTool/1.0` UA didn't match bot detection. Added to `map $http_user_agent $is_bot`
- **Fix: nginx sites-enabled was stale copy** — `sites-enabled/textstack` was a file, not symlink. Deploy now creates symlink via `ln -sf`
- **Retry logic** — failed routes retried up to 2x during SSG rebuild
- **Deploy SEO smoke test** — new CI step verifies `X-SEO-Render: spa` for real users, bot detection active, nginx bot map configured
- **Backup cleanup** — keep only 5 newest backups (deploy + scheduled), freed 37GB disk
- **Admin blog INTERNAL_ERROR** — all admin blog endpoints used `GetSiteId()` which throws on admin routes (SiteContextMiddleware skipped). Changed to `[FromQuery] Guid siteId` (PR #37)

### Blog
- **Full-stack blog** — admin CRUD, public pages, comments (2-level threaded), likes, share buttons
- **Admin panel** — create/edit/publish/unpublish, cover upload, stats, search, status/language filters
- **Web** — `/:lang/blog` list, `/:lang/blog/:slug` detail, Article JSON-LD, internal link interception
- **SSG** — prerender blog list + detail, `/sitemaps/blog.xml`, nginx location blocks
- **i18n** — en + uk translations, legacy URL redirects for `/blog`

### Vocabulary
- **Definition on review cards** — show dictionary definition below book sentence on all card types (MC, typed recall, context, feedback)

### TTS (Text-to-Speech)
- **Edge TTS integration** — direct WebSocket to `speech.platform.bing.com`, no deps, no API key
- **`TextStack.Tts`** — separate class library: `EdgeTtsClient` (WebSocket protocol), `EdgeTtsService` (disk cache + SemaphoreSlim)
- **API**: `GET /api/tts?text=&lang=&speed=` → MP3, `GET /api/tts/voices?lang=` → voice list
- **Two-layer cache** — server disk (SHA256 key, 30d TTL, 1GB limit) + client IndexedDB (30d TTL)
- **Vocabulary** — speak buttons on word list + all SRS cards (MC, typed recall, context, feedback)
- **Reader** — speak in SelectionToolbar, DictionaryPopup (word), TranslationPopup (source + translated)
- **Settings** — TTS speed in ReaderSettingsDrawer (0.75x – 2.0x)
- **Voices** — `en-US-AriaNeural` (en), `uk-UA-PolinaNeural` (uk), 200+ available
- **Tests** — 19 unit (EdgeTtsServiceTests), 11 integration (TtsEndpointTests), 6 E2E (tts.spec.ts)

### SEO Content — Full Coverage
- **654 authors** with full SEO (bio, relevance, themes, FAQs) — 100% of indexable authors
- **1,567 editions** with full SEO (description, relevance, themes, FAQs) — 100% of published editions
- **52 Ukrainian authors** — all with Ukrainian-language bios, themes, FAQs
- **~412 one-book English authors** — A–X alphabetical bulk generation
- **Priority authors**: Trollope (22), Wallace (19), Leblanc (12), Orczy (12), Norton (10)
- **73 two-book authors** + all 3+ book authors completed in earlier batches
- FAQ schema markup for rich snippets in search results

### Features
- **Authors pagination** — paginated author listing page
- **Header search fix** — query preserved on navigation
- **Reading progress** — cross-language library links, session reliability
- **i18n book detail** — all hardcoded English strings translated
- **EPUB fix** — handle self-closing `<script/>` in XHTML

### Content: OpenBook2 Ukrainian Library Import
- **220 EPUB books** imported from [OpenBook2](https://sites.google.com/view/openbook2) (public domain Ukrainian classics)
- **~50 Ukrainian authors** created — Франко, Шевченко, Леся Українка, Коцюбинський, Шекспір, Діккенс, etc.
- **Categories**: українська література, світова література, суспільне оцифрування
- **Scraper**: Node.js script crawled Google Sites pages, extracted Google Drive EPUB links, downloaded 311 MB
- **Upload**: batch upload via admin API with auto author/genre creation
- **Source**: OpenBook2 — електронна бібліотека класики української та світової літератури

### Rebrand: OnlineLib → TextStack
- **Solution & projects renamed** - `onlinelib.sln` → `textstack.sln`, `OnlineLib.*` → `TextStack.*`
- **C# namespaces updated** - 70+ files migrated to `TextStack.*` namespaces
- **Telemetry renamed** - service names `textstack-api/worker`, activity sources `TextStack.*`
- **GitHub repo renamed** - `github.com/mrviduus/textstack`
- **Deployment paths updated** - workflows, Makefile, nginx config

### Single Domain Consolidation (ADR-007)
- **textstack.app** - single public domain for all books
- **textstack.dev** - admin panel only (auth-gated, noindex)
- **Migration** - merge programming books to general site
- **Admin Tools page** - reprocess, reimport, sync operations
- **Removed multisite code** - HostSiteResolver, SiteService, AdminSitesEndpoints
- **Admin port** - changed from 5174 → 81 (easier to remember)
- **SSG Worker** - Docker service polls DB for rebuild jobs, prerenders pages automatically
- **See**: `docs/01-architecture/adr/007-single-domain-consolidation-deploy.md`

### Removed
- **DjVu format support** — unused, removed extractor, tests, Docker deps
- **Tempo** - distributed tracing service removed to save ~350MB RAM
- **Multisite infrastructure** — HostSiteResolver, SiteService, SitesPage (ADR-007)
  - Traces still collected via OTEL but not stored
  - To restore Tempo in future, see `docs/tempo-restore.md`

### Offline Reading (PWA)
- **IndexedDB storage** - chapters cached locally for offline reading
- **Download manager** - global context tracks active downloads, progress, errors
- **Resume support** - paused/interrupted downloads continue from last chapter
- **Storage quota check** - warns when <50MB available, handles QuotaExceededError
- **Kindle-style library UI** - 3-dots menu with download/resume/remove options
- **Offline badge** - visual indicator (download icon, spinner, pause icon)
- **Cache-first reader** - serves from IndexedDB when available

### User Authentication
- **Google OAuth** - cookie-based auth with JWT refresh
- **User library** - save/unsave books, persisted server-side
- **Reading progress sync** - resume position synced to server
- **Continue Reading** - library shows last read chapter with progress bar

### Library
- **My Library page** - grid view of saved books
- **Progress indicators** - visual progress bar per book
- **Read/unread status** - mark books as read
- **Quick actions** - context menu for common operations

### Search Improvements
- **Enter to search** - pressing Enter navigates directly to search page
- **Overlay close fix** - View All Results properly closes overlay
- **Direct navigation** - search input triggers page navigation

### Admin
- **Stats cards** - authors/genres pages show count summaries
- **Genres filter alignment** - consistent with authors page layout
- **Published filter** - sitemap/admin respects publication status

### SEO - Chapter Splitting
- **Chapter splitter** - long chapters auto-split at word boundaries (HTML block-aware)
- **Site-level config** - `MaxWordsPerPart` per site (general: 1000, programming: 2000)
- **Split-on-publish** - chapters split before publishing, reload after split
- **Reprocessing API** - `POST /admin/reprocess/split-existing` for batch reprocess
- **GeneratedRegex** - compiled regex patterns for performance

### Reader
- **Theme cleanup** - reader theme properly reset on unmount (fixes body class leak)
- **Mobile progress** - footer shows overall book % instead of chapter %
- **Help button** - hidden on mobile (keyboard shortcuts not applicable)
- **Scroll tracking** - mobile progress bar reflects scroll position
- **Double-tap fullscreen** - double-tap on content toggles fullscreen (mobile)

### SEO
- **Legacy URL redirects** - 301 redirect `/authors/*` → `/en/authors/*` (nginx + React Router)
- **Google Search Console fix** - non-prefixed URLs now properly redirect to language-prefixed versions

### i18n
- **Full Ukrainian i18n** — all pages translated (en/uk JSON files)
- **Dynamic language** in library list view links

### E2E Testing
- **Playwright e2e tests** — chromium, mobile, admin projects with CI pipeline
- **Flaky test fixes** — bookmark test waits for btn enabled before click

### Reader
- **Text selection** — highlights, translate (LibreTranslate), dictionary
- **iOS selection toolbar fix** — use `selectionchange` event, suppress native context menu in PWA

### Infrastructure
- **Regex timeouts** in text processors
- **Retry on 5xx/429 errors** — error state in home sections
- **Separate storage URL config** — reader highlights height fix

### SEO
- **Trailing slashes** on all sitemap URLs (books, authors, pages)
- **IndexNow API key** for Bing indexing
- **URL redirects & canonicalization** — redirect logic in HTTP block for Cloudflare SSL

### Ops
- **Sudoers** for passwordless nginx deploy
- **Backup directory** → `~/backups/textstack`
- **Docker context fix** — `.dockerignore` to exclude data folder, permission fixes

### Removed
- **Old IndexNow key file**
- **Redundant download button** from library list

### Documentation
- **database.md** - Updated to match actual schema: added UserRefreshToken, BookAsset, TextStackImport, SeoCrawlJob, SeoCrawlResult; fixed Chapter/User/IngestionJob/ReadingProgress/Bookmark/Note schemas; removed non-existent search_documents table

---

## [0.1.0] - 2025-01-09 - MVP 1

### Reader
- **Full-featured Kindle-like reader**
  - Centered text column, responsive layout
  - Settings drawer: font size, line height, width, theme (light/sepia/dark), font family, text alignment
  - TOC drawer, chapter prev/next navigation
  - Progress % indicator, localStorage persistence
- **Fullscreen mode** - auto-hide top/bottom bars, `F` shortcut
- **Keyboard shortcuts** - arrow keys, `?` for help modal, help button in top bar
- **Mobile support** - swipe navigation, centered nav arrows
- **Visual effects** - aged book edge / burnt paper effect

### UI/UX
- **Header** - collapsing animation on scroll, language switcher (UA/EN)
- **Search** - integrated in header, fuzzy/typo-tolerant, view all results link fix
- **Home hero** - responsive layout, improved alignment
- **Book grid** - responsive layout improvements
- **About page** - creator section with image

### Backend
- **SEO module** - `GET /seo/sitemap.xml`, `SeoService`, `SeoHead` component
- **Full-text search** - PostgreSQL FTS, pg_trgm fuzzy search, GIN indexes
- **Example books seeder** - migration seeds sample data
- **Public API** - `/books`, `/books/{slug}`, `/books/{slug}/chapters/{chapterSlug}`, `/authors`, `/genres`, `/search`
- **Admin API** - file upload, ingestion jobs CRUD
- **EPUB parser** - VersOne.Epub + HtmlAgilityPack, chapter extraction
- **Ingestion worker** - background polling, EPUB → chapters, search_vector indexing
- **Data model** - Work/Edition hierarchy, Admin auth system, UserLibrary
- **Admin app** - separate React app on port 81

### Changed
- Rebrand to **TextStack**, default language to English
- Book/Translation → Work/Edition data model
- Swashbuckle → Scalar.AspNetCore for OpenAPI
- Docker compose defaults (`.env` optional)

### Technical
- Fresh migration: `Initial_WorkEdition_Admin`
- Removed: Book, BookTranslation, ChapterTranslation entities

