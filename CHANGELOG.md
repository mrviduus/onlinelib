# Changelog

## [Unreleased]

### AI platform — Phase 3: Podcast MVP (2026-06-06)

Two-voice "podcast" (NotebookLM-style dialogue) generated per catalog edition: LLM builds a script, Edge TTS voices each line, ffmpeg stitches an mp3 the reader can play. Shipped in small PRs.

- **AI-015 — podcast endpoints** (this PR) — HTTP to enqueue + check a podcast (no more manual SQL). **`POST /admin/podcasts` {editionId, lang?}** enqueues a job — **admin-only** (guarded by AdminAuthMiddleware), idempotent (returns the existing queued/running/succeeded job for that edition+lang). **`GET /books/{slug}/podcast`** is public: resolves the catalog edition (site+language+published, like `BooksEndpoints`) and returns the latest job as `{jobId, status, audioUrl?, durationSeconds?}` (`audioUrl = /storage/{AudioPath}` once succeeded). The mp3 is served by the existing `/storage` static root — no nginx/infra change. (Generation is curated from the admin panel; the reader just plays — see AI-016.)
- **AI-014 — `PodcastWorker` (feature live end-to-end)** (this PR) — the background service that ties Phase 3 together: polls `podcast_generation_jobs`, and for each Queued job runs `PodcastScriptBuilder` → `AudioAssembler` → saves the mp3 via `IFileStorageService` → updates status (Queued→Running→Succeeded/Failed) with `ScriptJson`, `AudioPath`, `DurationSeconds`. Mirrors `IngestionWorker` (singleton `BackgroundService`, per-job DI scope, 5s poll, 10-min stuck-job recovery, loop survives errors). With this, a queued job now produces a playable podcast mp3 — the API endpoint + reader button (AI-015/016) just enqueue and play. `CostUsd` stays null for now (per-call cost lives in `llm_traces`).
- **AI-013 — `AudioAssembler` + ffmpeg** (this PR) — turns the Aria/Guy script into one mp3: each line is synthesized with the matching **Edge TTS** voice (`en-US-AriaNeural` / `en-US-GuyNeural`, free) and the segments are stitched with **ffmpeg** (concat demuxer, `-c copy` — no re-encode). `Worker.Services.AudioAssembler` (`IAudioAssembler` → `PodcastAudio{Mp3,DurationSeconds}`); duration estimated from the fixed 48 kbit/s bitrate. Pure helpers (`VoiceFor`, `BuildConcatFileContent`, `EstimateDurationSeconds`) are unit-tested. Worker now references `TextStack.Tts` + registers TTS/assembler in DI, and the Worker Docker image installs `ffmpeg`. Service only — wired into the worker in AI-014. (MVP: English voices, no crossfade.)
- **AI-012 — `PodcastScriptBuilder` (structured dialogue)** (this PR) — turns a catalog edition into a 2-voice (Aria/Guy) podcast script: loads chapters (ordered), fits them into a ~6000-word budget, prompts the gateway (FeatureTag `podcast.script` → OpenAI `gpt-4.1-nano`) for a strict-JSON dialogue array, parses it. `Application.Ai.PodcastPrompt` (reusable prompt) + `Worker.Services.PodcastScriptBuilder` (`IPodcastScriptBuilder`, records `PodcastScript`/`DialogueLine`) with a unit-tested `ParseScript` (robust to prose/fences; drops empty lines + non-Aria/Guy speakers). FeatureTag + `Ai:Routes` wired (Api + Worker), DI registered. Service only — not invoked yet (Worker/endpoints/UI/audio in AI-013→016).
- **AI-011 — `PodcastGenerationJob` entity + migration** (this PR) — foundation only (no behavior). New `PodcastGenerationJob` (edition-scoped: `EditionId` FK cascade, `Lang`, `Status`, `ScriptJson` jsonb, `AudioPath`, `DurationSeconds`, `CostUsd`, `Error`, timestamps) + `PodcastJobStatus` enum (Queued/Running/Succeeded/Failed), mirroring the `BookQualityJob` job pattern. DbSet on `IAppDbContext`/`AppDbContext`, EF config in `AppDbContext.Podcasts.cs` (indexes on status + edition), migration `AddPodcastGenerationJob` (table `podcast_generation_jobs`). Script builder will use the gateway (`gpt-4.1-nano`, FeatureTag `podcast.script`); TTS reuses the free Edge TTS. ScriptBuilder/AudioAssembler/Worker/endpoints/UI follow in AI-012→017.

### AI platform — observable LLM layer (foundation) (2026-06-04)

Building a unified, observable LLM layer so every AI call (Explain, Translate,
Distractor, BookMetadata, TagSuggestion, …) routes through one seam and is
logged for cost/latency/quality. Shipped as small, self-contained PRs; the new
stack runs in parallel with the legacy `ILlmServiceFactory` path — callers
migrate later (AI-005), so behavior is unchanged so far.

- **AI-001 — `TextStack.Ai.Core`** ([`dc7b28e`](https://github.com/mrviduus/textstack/commit/dc7b28e)) — new class library with the AI contracts: `ILlmService` (LlmRequest/LlmResponse/LlmUsage/LlmMessage/LlmDelta), `ITool`, `IEmbeddingService`, `IAgent`, `ILlmTraceWriter` + supporting records. Pure interfaces, zero implementations.
- **AI-002 — `TextStack.Ai.Llm` providers** ([`bff1523`](https://github.com/mrviduus/textstack/commit/bff1523)) — `OpenAiLlmClient` + `OllamaLlmClient` ported 1:1 from the legacy services onto the new `ILlmService` (production quirks preserved verbatim: OpenAI reasoning-budget `+512` padding, Ollama `think=false`). `ModelPricing` is the single source of per-model USD cost, surfaced on `LlmResponse.Usage`.
- **AI-003 — TracingDecorator + `llm_traces`** ([`54d2598`](https://github.com/mrviduus/textstack/commit/54d2598)) — singleton decorator wraps any provider and records a **sampled** trace (cost/tokens/latency/error) **fire-and-forget** on a fresh DI scope, so persistence adds no latency. New Postgres table `llm_traces` (jsonb messages, `numeric(10,6)` cost, FK user ON DELETE SET NULL) + `DbLlmTraceWriter`. Email/phone redacted before persist; errors always sampled, high-volume features sampled at 10% (ADR-AI-011).
- **AI-004 — `ModelGateway` v0 + DI composition** ([`d6f9e95`](https://github.com/mrviduus/textstack/commit/d6f9e95)) — `ModelGateway` (a composite `ILlmService`) routes each call to a provider by `FeatureTag` via `Ai:Routes` config, then the full stack is wired in DI: keyed providers → `TracingDecorator` → gateway as the default `ILlmService`. Routing mirrors the existing per-feature mapping (explain/translate → OpenAI, distractor/bookmeta/tagsuggestion → Ollama) so nothing changes until callers migrate. Cost-cap / shadow / escalate are deferred to a later phase.
- **AI-005 — legacy adapter + route callers through the new stack** (this PR) — `LlmServiceFactory.Get(job)` now returns a `LegacyLlmAdapter` over the gateway instead of the old keyed providers, so all 5 callers (Explain, Translate, Distractor, BookMetadata, TagSuggestion) run through `ModelGateway → TracingDecorator → provider` **with zero caller changes** — and traces now flow end-to-end into `llm_traces`. Routing/behavior preserved (FeatureTag map mirrors the old `LLM:Providers`). The dead `OpenAiLlmService`/`OllamaLlmService` are deleted; the `Domain.LLM.ILlmService` interface + adapter remain until callers move to `Core.ILlmService` directly.
- **AI-006 — `TextStack.Ai.Evals` + first golden (Explain)** (this PR) — quality measurement for the LLM layer. New `TextStack.Ai.Evals` library: feature-agnostic `GoldenRunner` (runs a golden dataset through `ILlmService`) and `JudgeRunner` (LLM-as-judge → strict-JSON `{accuracy, conciseness, usefulness}` 1–5 + aggregate). First golden: 30 hand-curated Explain cases (dev/AI domain + general) in `tests/TextStack.AiEvals/Datasets/explain.json`, scored against the **real** Explain prompt (extracted to `Application.Ai.ExplainPrompt` so eval and endpoint can't drift). The eval runs as an **opt-in** `dotnet test` (`Category=Eval`) that self-skips without `OPENAI_API_KEY`, so default CI stays green; run it with `OPENAI_API_KEY=… dotnet test tests/TextStack.AiEvals --filter Category=Eval`. Judge routes through the same OpenAI gateway now (FeatureTag `eval.judge`); swapping to Claude is a later config/provider change. Baseline capture + a CI regression gate are deferred (AI-010).
- **AI-007 — goldens for Translate / Vocab / BookMetadata** (this PR) — extends eval coverage to the rest of the gateway-reachable AI surfaces (SEO stays out — it runs via Claude CLI, not `ILlmService`). The judge harness is generalized: `JudgeRunner` now takes a per-feature `Rubric` (three named axes) instead of the fixed accuracy/conciseness/usefulness triple, so each feature scores on relevant dimensions (Translate: accuracy/fluency/register; distractor: plausibility/distinctness/difficulty; hint: helpfulness/no-spoiler/brevity; explanation: accuracy/clarity/nativeness; bookmeta: genre/year/description). Three new 30-case golden datasets + opt-in eval tests. Real prompts extracted to reusable builders (`Application.Ai.TranslatePrompt`, `TextStack.Vocabulary.DistractorPrompt`, `Worker.Services.BookMetadataPrompt`) so evals can't drift from production (pure extracts — caller behavior unchanged). Generation runs on each feature's real provider (Translate→OpenAI, Vocab/BookMeta→Ollama) while the judge runs on OpenAI (`eval.judge`); tests self-skip when the key/Ollama isn't present, so default CI stays green. Run: `OPENAI_API_KEY=… dotnet test tests/TextStack.AiEvals --filter Category=Eval` (Ollama running for vocab/bookmeta).
- **AI-008 — `/ai-quality` admin dashboard (Summary tab)** (this PR) — makes the LLM layer **visible**. New admin page surfaces, per `feature_tag` over a selectable window (7/30/90d), what was previously buried in `llm_traces`: cost (total + /day), p50/p95 latency, error rate, call volume, token counts, and a tiny inline-SVG cost-per-day sparkline. Backend: `GET /admin/ai-quality/summary?from=&to=&feature=` (admin-only via AdminAuth) aggregates `llm_traces` with raw SQL (`percentile_cont` for true p50/p95). Frontend: `apps/admin` page + nav entry, no chart dependency. Judge-score trends are deferred until eval runs persist to a table (AI-010); Traces + Evals drill-down tabs are AI-009.
- **AI-009 — `/ai-quality` Traces + Evals tabs (+ `eval_runs`)** (this PR) — drill-down for the dashboard. **Traces tab**: searchable, paged table over `llm_traces` (filter by feature + free-text `ILIKE` on prompt/response) with a click-through detail modal showing the full system prompt, messages, response, tool calls and metrics. **Evals tab**: per-feature eval-score history with regressions flagged red (score drop >0.1 vs the previous run). New `eval_runs` table + entity persist eval results — keyed by `feature` string (no `eval_dataset` FK, since goldens are file-based per ADR-AI-006), written best-effort by the opt-in eval suite when `EVAL_DB_CONNECTION` is set. Backend: `GET /admin/ai-quality/traces`, `/traces/{id}`, `/evals` (admin-only). **Eval judge is now provider-selectable** (`EvalClients.Judge()`): defaults to OpenAI, set `EVAL_JUDGE=ollama` to judge locally on gemma4 — vocab/bookmeta then run **fully on local Ollama** with no OpenAI key (a small local judge is noisier, so scores are looser). A CI regression gate on top of `eval_runs` is AI-010.
- **AI-010 — in-app eval runner + admin "Run evals"** (this PR) — evals become a product capability: a new **`TextStack.Ai.EvalSuite`** library (separate from API/Application) holds the goldens (embedded), per-feature `EvalDefinitions` (real prompts + rubrics) and `EvalSuiteRunner`. An admin button (`POST /admin/ai-quality/evals/run`, background, one-at-a-time guard + `GET .../evals/status`) runs the suite **on prod through the real `ModelGateway`** — explain/translate→OpenAI, vocab/bookmeta→Ollama, exactly like production — judging by default on **local Ollama/gemma4 (free, no OpenAI key)** or OpenAI. Results persist to `eval_runs`; the Summary tab now shows the latest **eval score** per feature, and the Evals tab still flags regressions. The `dotnet test` eval suite is consolidated onto the same runner (one source of truth for goldens/prompts/rubrics; the bespoke per-feature test classes + the `EVAL_DB_CONNECTION` recorder are removed). No baseline-file CI gate (hosted CI has no LLM secrets); regression is human-in-the-loop via the dashboard.

### Web header — restore search icon on non-home pages (2026-05-24)

- **Search icon back in the header** ([`4eb1986`](https://github.com/mrviduus/textstack/commit/4eb1986)) — was removed in [`3e53e3e`](https://github.com/mrviduus/textstack/commit/3e53e3e) on the assumption that the hero search on home was enough. It wasn't: on every other page (library, discover, vocabulary, reader, …) the hero is gone and users had nowhere to launch a search from. Icon now shows on all routes except home (where the hero input still owns the affordance), opens the existing `MobileSearchOverlay`, and ships with 10 new `Header.test.tsx` cases pinning visibility per route + open/close flow.

### Safe refactor — backend partial-class splits + util tests (2026-05-24)

Cosmetic refactor pass: three god-class backend files split across C# partial
files (compile-identical to original IL — zero behaviour change, integration
tests verify), plus net-new unit-test coverage on critical web + mobile pure
utilities. Largest non-migration backend file dropped from 1559 → 875 LOC.
All splits use single-domain-per-file boundaries so future review can scope
to one concern without scrolling past nine others.

- **`AppDbContext.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — EF Core model configuration extracted from one 655-LOC `OnModelCreating` to 7 domain-scoped partial files (`Catalog`, `User`, `Reading`, `UserBooks`, `Vocabulary`, `Ops`, `Seo`, `Collections`). Main file is now 104 LOC of DbSet declarations + dispatcher. Migrations unaffected — EF model snapshot is identical.
- **`VocabularyEndpoints.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 1559-LOC single endpoint file split: 6 sub-domain partials (`Stats`, `Settings`, `Pending`, `Lookups`, `Clusters`, `Admin`) for the 24 routes that were drowning each other out. Shared helpers (`TryGetAuth`, `ToDto`, `UpsertLookupAsync`, `QueueEnrichment`) stay in main alongside `MapVocabularyEndpoints` + DTOs. Reviewer can now diff one anti-spiral phase without seeing the others.
- **`AdminService.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 977-LOC god service split into 4 partial files by domain (`Upload`, `Editions`, `Chapters`, `UserUploads`). Primary constructor + DI + shared `EnqueueSsgSafe` helper stay in main (131 LOC). Each domain partial under 400 LOC.
- **Web util tests** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 40 new Vitest cases covering `analytics.ts` (GA4 event shape contract, gtag fallback, PII boundaries), `dataEvents.ts` (CustomEvent bus + cross-component hook), `errorUtils.ts` (HttpError detection), `formatTime.ts` (hour/minute formatting). Web suite now 474 tests.
- **Mobile Vitest infra + pure-util tests** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — new `vitest.config.ts` with an in-process `AsyncStorage` mock alias so any `lib/` module can be unit-tested without RN runtime. 38 cases covering `searchUtils` (NFD diacritic stripping incl. surprising Cyrillic `й` → `и` behavior, documented), `features` (reader-overlay killswitch cascade), `vocabStatsCache` (TTL + corrupt-JSON defense). Mobile lib code can now be tested without bundling RN.

### Mobile reader — bug sweep + architecture refactor (2026-05-23)

Five user-reported Android bugs blocking Play Store launch, plus a senior
architecture pass extracting pure logic to `@textstack/shared` so both
catalog and user-book readers share the same formulas (book-progress,
LWW merge, locator parsing). 144 unit tests + 9 property-based tests
(~2300 generated cases), 100% behavioral coverage on shared reader code.

- **TOC sheet no longer empty** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — chapter list rendered as 0-height sheet when chapters hadn't loaded; now shows loading spinner or "No chapters available" with `minHeight: 200`. Both `apps/mobile/app/reader/.../[chapterSlug].tsx` (catalog) and `apps/mobile/app/my-books/read/.../[chapterSlug].tsx` (user-books) wire `chaptersLoading` state through to `TocSheet`.
- **Save word closes the toolbar** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `useReaderVocabActions.saveWord` now calls `setSelection(null)` after success / `already_saved` / `pending`, matching `markKnown` and `removeWord`. Added `savingRef` race guard for rapid double-taps. Same fix in `promoteLookup`.
- **Selection toolbar has a close button** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `SelectionActionBar` accepts `onClose` prop and renders an X icon. Both readers also clear the native WebView selection range so leftover highlight rectangles don't linger after dismissal.
- **Progress bar shows book %, not chapter %** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — new pure `computeBookProgress(chapters, slug, chapterProgress, totalWordCount)` in `@textstack/shared/reader` (word-count weighted with chapter-index fallback). Both readers compute book % on every WebView `progress` message + eagerly on chapter nav. `LocalProgress.bookPercent` cached so home `ContinueReadingCard` shows the same % the reader footer did. 30 unit tests including monotonicity invariant and infinite-scroll boundaries.
- **App relaunch lands on home after long background** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `ColdResetOnResume` component (isolated so `usePathname` re-render is scoped) calls `router.replace('/')` after 30 min of background, UNLESS user was in `/reader/*` or `/my-books/read/*` (Kindle model: reading sessions are intentional, resume them; transient nav resets fresh). Fires `app_resumed_from_background` analytics event with PII-safe `bucket_minutes` + `path_prefix` for post-launch dashboard debugging.
- **`pickContinueReadingBook` extracted + tested** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — was the most complex code in `ContinueReadingCard.tsx` (4-source LWW merge, mixed timestamp formats). Now pure function in `@textstack/shared/reader/continueReading.ts`. 26 hand-crafted + 5 property-based tests (1000+ cases) covering catalog/user-book mixes, grace window, malformed timestamps. Catalog books that aren't in library never picked; finished books never picked; result.updatedAtMs always = max of valid items. Found a real bug in the process: `Date.parse('garbage')` returned NaN that silently leaked through `=== 0` checks → fixed via `parseEpochMs()` helper accepting both ISO string + epoch number.
- **`parseScrollLocator` shared parser** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — two inline `split(':')` parsers in the readers would break on chapter slugs containing `:` (possible for user-uploaded EPUBs with titles like "Chapter 1: Introduction"). New parser in `@textstack/shared` splits from the right via `lastIndexOf`, strict-digit regex on offset, round-trip property-tested. 20 tests covering happy path, multi-colon slugs, malformed inputs.
- **`useUserBookProgress` + `useFlushOnBackground`** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — sibling hook to `useReaderProgress` with identical contract (`saveProgress` / `bumpProgress`). Removes ~80 LOC of inline save logic from user-book reader. `useFlushOnBackground(flush)` factored out the Android OS-kill mitigation (AppState background → flush) both readers shared, now with reentry guard + try/catch so a buggy flush doesn't detach the AppState subscription. Critical for Android (current launch focus) where the OS evicts apps without running React cleanup.
- **ADR-011** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `docs/01-architecture/adr/ADR-011-mobile-reader-progress-architecture.md` documents the platform priority (Android first), book-progress single-source-of-truth strategy (client-side, no backend changes needed for multi-device consistency), and the sibling-hooks-not-polymorphic-hook decision. References Android Doze, RN AppState, Expo Router state docs.

### PDF content quality — Claude cleanup pipeline (2026-05-22)

Slices 1-4 of feat-0007 (`docs/05-features/feat-0007-pdf-content-quality.md`).
Makes PDF-extracted books readable: heuristics get ~70-75%, the gap to ~90% is
semantic (running headers in body, fragmented paragraphs, hyphenation, inlined
footnotes). Closes it with a gated Claude cleanup pass, and logs every fix so
the deterministic heuristics can ratchet up over time. Marker (ML PDF pipeline)
was evaluated and shelved — the prod GPU's 4 GB VRAM can't hold its model set.

- **`ChapterContentQualityAnalyzer`** — deterministic 0-100 content-quality
  score + issue codes (fragmented paragraphs, running headers in body,
  unmerged hyphenation, orphan page numbers, inlined footnotes) for extracted
  chapter HTML. Pure C#, 12 unit tests. The gate that decides which chapters
  warrant an LLM pass.
- **Score persisted at ingest** — `ContentQualityScore` column on `Chapter` +
  `UserChapter`, set in both ingestion paths; `BookQualityJob` carries Phase 3
  tracking counters. Worker logs a per-book score distribution.
- **`quality-poll.sh` Phase 3** — for each chapter below the quality threshold,
  Claude CLI fixes structure (preserving content verbatim); a stdlib-only
  preservation gate (`pdf-cleanup-gate.py`) rejects hallucination or
  over-deletion via word-multiset diff before the cleaned HTML is written back.
  Every (messy → clean) pair is logged to `data/pdf-cleanup-dataset/` as fuel
  for the future heuristic ratchet. Off by default — `CONTENT_CLEANUP_ENABLED`.
- **Admin observability** — the Book Quality job detail panel shows Phase 3
  results (chapters cleaned / rejected / skipped).

### Mobile reader — autosave restore (2026-05-13)

- **WordCard parity with web WordPopup** — single-word tap on mobile
  showed a manual "+ Save" CTA even though `autoSaveWord` already fires
  on selection. Confusing: identical action surfaced as both implicit
  (auto-save) and explicit (button). Web's `WordPopup` has no Save
  button — `isSaved` is derived from `vocabMap`. Removed the "+ Save"
  CTA from `apps/mobile/src/components/WordCard.tsx`; auto-save remains
  the only path. Also patched `useReaderVocabActions.autoSaveWord` to
  flip `wordSaved=true` on `already_saved` outcome so the popup shows
  "✓ Saved to vocabulary" instead of an empty actions row when the
  server reports the word was already in vocab but `vocabMapRef` was
  stale.
- **In-chapter scroll restore on chapter load** — mobile reader was
  saving `{chapterSlug, percent}` to AsyncStorage and to the server, but
  never reading the percent back: every chapter mount put the user at
  scrollY=0 even when "Continue Reading" routed to the correct chapter.
  PWA-parity fix in `apps/mobile/app/reader/[bookSlug]/[chapterSlug].tsx`:
  on `(editionId, chapterSlug)` change, fetch `getLocalProgress` (local
  AsyncStorage, instant + offline-safe); fall back to
  `readingProgressApi.getProgress` for the cross-device case (read on web
  → open on phone). On WebView `onLoadEnd`, one-shot
  `requestAnimationFrame` → `window.scrollTo(0, scrollHeight * percent)`.
  One-shot guard prevents re-scrolling after settings tweaks rebuild the
  HTML and re-fire `onLoadEnd`. Caught in audit ahead of Play Store
  launch.

### Headline — Gemma 4 swap + the bugs it surfaced

Switching the local LLM from `qwen3:8b` to `gemma4:e4b` looked like a
five-minute model-name change. Behind it sat a chain of latent prod bugs
that only became visible once we started actually reading the saved
distractors/hints/explanations and the freshly enriched book metadata.
This `[Unreleased]` block tracks the swap **and** every follow-up fix that
landed before publishing the Gemma 4 Challenge write-up.

### Changed

- **Local LLM model**: switched from `qwen3:8b` to `gemma4:e4b`, then
  trimmed once more to `gemma4:e2b` after prod data showed CPU-only
  `e4b` inference was missing the 30 s timeout window on most requests.
  Both are Gemma 4 (challenge-condition preserved); `e2b` is the
  effective-2B MoE variant — 7.2 GB on disk vs 9.6 GB for `e4b`, ~2-3×
  faster inference on the same CPU. Quality on the
  distractor / hint / explanation prompt is comparable for short
  single-word outputs; will measure on prod 1-2 days post-swap. Same
  `ILlmService` interface, no API changes. To roll back to `e4b`:
  override env `Ollama__Model=gemma4:e4b`.
- **Ollama container**: image pinned to `ollama/ollama:0.23.1` (the floating
  `latest` tag was still serving 0.22.x which doesn't recognise the
  `gemma4` family). Memory limits raised from 4G/2G to 12G/8G — `gemma4:e4b`
  needs ~9.8 GiB RAM to load weights + KV cache, `gemma4:e2b` needs ~5 GiB
  but we keep the 12G ceiling so swapping back to `e4b` is one env-var
  change away. Server has 31 GB total so the headroom is plenty.
- **Ollama `keep_alive=-1`**: PR #234 — keep the model resident across idle
  windows. Without this, a 5-minute lull (typical between two user-vocab
  saves) made every next save eat a 30-60s cold model load. `ollama ps`
  now consistently shows `UNTIL=Forever` for `gemma4:e4b`.
- **API + Worker Ollama timeout**: raised `Ollama:TimeoutSeconds` from
  `30` → `90` in both `appsettings.json`. Gemma 4 e4b on CPU-only takes
  >30 s for some prompts (especially first inference after a model load).
  At 30 s the API logged a 100% timeout rate for vocab enrichment; at 90 s
  the success rate climbs back to normal. Cost: cap on worst-case latency
  per word doubled, but enrichment is fire-and-forget so the user sees no
  difference. To roll back: revert this commit or override via env var
  `Ollama__TimeoutSeconds`.
- To roll back the model entirely: set `Ollama__Model=qwen3:8b` env var or
  revert the swap commit.

### Fixed

- **Worker couldn't reach Ollama** (`localhost:11434` instead of
  `http://ollama:11434`). `docker-compose.yml` had set `Ollama__BaseUrl`
  on the `api` service but not on `worker`, so every
  `BookMetadataGenerator` call from the worker hit `Connection refused`
  silently — every user-uploaded book ended up with `genre = NULL`, which
  in turn meant the domain-aware translation prompt had nothing to bias
  against. Fix: add `Ollama__BaseUrl` + `Ollama__Model` to the worker env
  block, mirroring the api block. Discovered by greping the worker logs
  during prod-stats collection for the Gemma 4 article — visible only via
  `docker compose logs worker | grep "Connection refused"`.
- **`MetadataBackfillWorker` (one-shot)**: new `BackgroundService` that
  on worker startup picks up to 50 user_books with `Status=Ready AND
  Genre IS NULL`, runs `BookMetadataGenerator` against each (2 s gaps),
  and writes the result back. Heals the ~10 books that were ingested
  while the worker was pointing at the wrong host. Idempotent —
  re-running on a healthy DB is a no-op.
- **`/api/explain` returned 404**: client called `${API_BASE}/api/explain`
  but in prod `API_BASE='/api'`, so the URL became `/api/api/explain`.
  Translation got away with the same bug because it has a `/translate`
  compat route on the backend; Explain didn't. Fix in
  `apps/web/src/api/explain.ts` and `dictionary.ts`: drop the redundant
  `/api/` prefix. Backend `Map("/explain")` route untouched.
- **Domain-aware tap-on-word translation**: `TranslateRequest` now
  accepts optional `BookId` / `Sentence` / `Genre`. Backend mirrors
  ExplainEndpoints to resolve genre from `Editions` then `UserBooks`,
  fails soft if neither exists. Prompt biases toward the
  domain-specific reading and asks for a short parenthetical clarifier
  in the target language (the README's "увага (механізм у нейромережах)"
  pattern). Cache key now includes genre + sentence so a CS-context
  translation of "polling" doesn't poison the cache for the same word
  in a news-context query.
- **EPUB titles like `"Designing Data-Intensive Applications (for )"`**:
  O'Reilly Atlas templates ship `dc:title` with `(for ${atlas.author_email})`;
  some retail pipelines strip the variable but leave the parens. New
  `BookTitleCleaner` utility (`backend/src/Extraction/.../Utilities/`)
  removes the trailing parenthetical when its content is empty,
  whitespace-only, a known template syntax (`${var}`, `{{var}}`, `$var`,
  `%var`), or any combination of Unicode formatting chars (ZWSP, ZWJ,
  BOM, NBSP, soft hyphen, embedding controls). Wired into Epub/FB2/PDF
  extractors. 26 unit-test cases covering real-world variants.
- **Migration `\b` bug — PostgreSQL doesn't treat `\b` as a word
  boundary**: V1 and V2 of `CleanUserBookTitles` used `\b` inside the
  SQL regex assuming Perl/PCRE semantics. PostgreSQL's Advanced Regex
  Engine treats `\b` as backspace (`U+0008`), so the migrations
  silently no-op'd against actual `(for )` titles in prod. Verified
  with:

  ```sql
  SELECT 'X (for )' ~ '\(\s*for\b\s*\)\s*$';  -- false (!)
  SELECT 'X (for )' ~ '\(\s*for\s*\)\s*$';    -- true
  ```

  V3 migration (`20260511012517_CleanUserBookTitlesV3`) drops the `\b`
  entirely — the surrounding parens already pin "for". The clean-up
  finally applied retroactively on deploy.
- **Translate cache permission**: `/data/translate-cache` was mounted
  root-owned (uid 0) while the api container runs as uid 1000. Every
  cache write logged EACCES (translation worked but nothing got cached).
  `Makefile` `fix-permissions` target gains the `translate-cache` dir;
  GitHub Actions deploy workflow now runs `make fix-permissions` before
  `docker compose up`. Idempotent, adds ~1 s per deploy.

### Production snapshot (collected for the article)

Read-only data pull from prod 2026-05-11 ahead of publish, after the
`Connection refused` worker bug got patched but before the timeout bump
landed:

- **Words saved since the Gemma 4 swap (2026-05-07 → 2026-05-11):** 13.
- **Of those, Gemma-generated `Distractors` / `Hint` / `Explanation`:** 2
  each. The other 11 hit the 30 s Ollama timeout and fell through to the
  random+hardcoded distractor fallback (no hint, no explanation).
- **Average distractors per generated word:** 4.5 (range 4–5; target 5).
- **Time window since swap:** 70.4 hours.
- **Ollama uptime:** the model was resident the entire time (`ollama ps`
  showed `UNTIL=Forever` consistently) — every miss was a wall-clock
  timeout, not a cold-load.
- **One real (word, distractors) pair worth quoting in the article:**
  `warehouse → ["storeroom", "depot", "facility", "silo", "loft"]`. Five
  domain-adjacent single-word distractors, exactly the shape the prompt
  asks for.
- **One real example of the prompt working in context:** Explain on
  *Designing Data-Intensive Applications*, ETL phrase, target Spanish,
  produces a 2-3-sentence explanation with a concrete analogy ("Es como
  recoger ingredientes de varias tiendas, prepararlos y luego guardarlos
  en una despensa lista para cocinar."). That clip is `docs/demo.gif`.

After the 30 s → 90 s timeout bump + worker URL fix, success rate is
expected to climb to ~100 %. Will re-measure after a deploy cycle and
post the delta in the article body.

### Punchline — Gemma 4 thinking mode was eating the answer

The real root cause behind the 2/13 success rate wasn't the timeout
or the Ollama URL. It was **thinking mode**. Direct probe on prod:

```text
$ ollama run gemma4:e2b "Reply EXACTLY: GENRE: <...>\nYEAR: <...>..."
Thinking...
Thinking Process:
1. **Analyze the Request:** The user provided a context...
2. **Analyze the Constraint:** The instruction is to "Reply EXACTLY..."
...
```

Gemma 4 (both `e4b` and `e2b`) is a reasoning model. Every call emits
a long chain-of-thought preamble before the answer. With
`num_predict=600` (our cap for `DistractorGenerator` /
`BookMetadataGenerator`), the thinking budget ate the whole window
and the response we tried to parse contained no `GENRE:` /
`DISTRACTORS:` / `HINT:` / `EXPLANATION:` lines — every fire-and-
forget enrichment returned null. The 2 successful calls in the
2/13 sample? Pure luck — those prompts happened to finish thinking
inside the token budget.

Fix: pass `think: false` in the `/api/generate` body. Ollama 0.6+
supports the flag for thinking-capable models; non-thinking models
silently ignore it. One JSON field, four lines of code:

```csharp
var request = new
{
    model = _model,
    prompt,
    stream = false,
    think = false,    // ← this one
    options = new { num_predict = maxOutputTokens },
};
```

### Production numbers, after `think: false` (re-collected 2026-05-11)

| Metric                        | Before (no `think:false`) | After (`think:false`) |
|-------------------------------|---------------------------|-----------------------|
| Enrichment success rate       | 2 / 13 = **15 %**         | 12 / 12 = **100 %**   |
| Per-call inference time       | 90 s → **timeout**        | 0.6 s eval / 1.5 s total |
| Tokens emitted per call       | ~600 (capped, all thinking) | **13**              |
| CPU burn per 5 saves          | 5–8 min of 100 % CPU      | ~7.5 s of 100 % CPU   |
| `MetadataBackfillWorker` run  | enriched = 0 / 6          | enriched = 6 / 6      |

Real (word → distractors) samples written by Gemma 4 e2b after the
fix, harvested from `vocabulary_words`:

```
were    → ["was", "is", "am", "be", "had"]
without → ["lacking", "except", "beyond", "unless", "besides"]
warehouse → ["storeroom", "depot", "facility", "silo", "loft"]
```

Clean, single-word, semantically adjacent, no synonyms. Exactly the
shape `DistractorGenerator.BuildPrompt` asks for. The hint sentences
and per-word Russian explanations land equally well — full samples in
the article body.

CPU temperature on the prod box (Ryzen 5 4600H, no GPU) sits at ~43 °C
idle, peaks at ~71 °C during a 5-word burst, falls back inside a
minute. Throttle threshold is ~95 °C; we're nowhere near it.

### Also fixed in the same pass

- **SSG worker zombie pile-up** — Puppeteer was leaving `<defunct>`
  Chromium + `chrome_crashpad` children every prerender (28 + 28 = 56
  observed on the host). Added `init: true` to the `ssg-worker`
  service in `docker-compose.yml`; Docker now runs `tini` as PID 1 to
  reap SIGCHLD'd children. Zero behaviour change in SSG output, just
  keeps the process table from drifting toward PID exhaustion.
- **OpenTelemetry CVEs** — bumped `OpenTelemetry.Api` /
  `OpenTelemetry.Exporter.OpenTelemetryProtocol` / instrumentation
  packages from 1.11.x to 1.15.3 (stable). Clears GHSA-4625-4j76-fww9
  and GHSA-g94r-2vxg-569j. `dotnet list package --vulnerable` now
  reports zero hits across the solution.

### Discovery — there's a GPU on prod, it was sitting idle

Pulling system info for the load-test bottleneck section surfaced a
discrete GPU the deployment never actually used:

```
$ lspci | grep -iE 'vga|3d'
01:00.0 NVIDIA Corporation TU117M [GeForce GTX 1650 Ti Mobile]
05:00.0 AMD [Radeon RX Vega 6 ...]
$ nvidia-smi --query-gpu=name,memory.used --format=csv
NVIDIA GeForce GTX 1650 Ti, 5 MiB
```

The 1650 Ti is a 4 GB-VRAM mobile-class card — small for an LLM —
but with `gemma4:e2b` taking ~7.2 GB on disk, even **partial GPU
offload** (half the layers on GPU, half on CPU) is meaningfully
faster than the pure-CPU baseline we'd been measuring.

What was missing:
- `nvidia-container-toolkit` on the host (Docker had no `nvidia`
  runtime — `docker info` showed only `runc`)
- `runtime: nvidia` + a `gpu` device reservation on the ollama
  service in `docker-compose.yml`

Wired both in this pass. Host bootstrap is one-shot via
`scripts/loadtest/install-nvidia-toolkit.sh` (idempotent — installs
the toolkit if absent, registers the runtime with dockerd, runs a
`nvidia/cuda` smoke container to verify the GPU shows up inside). The
compose change deploys via GH Actions like everything else.

Smoke verification on prod after the toolkit install:

```
$ docker run --rm --gpus all --runtime=nvidia nvidia/cuda:12.2.0-base nvidia-smi -L
GPU 0: NVIDIA GeForce GTX 1650 Ti (UUID: GPU-60920952-b37a-b82f-...)
```

Capacity caveat baked into the compose comment: 4 GB VRAM vs 7.2 GB
model = partial offload. Realistic speedup vs pure CPU: **2–3×**, not
the ~10× a full-offload datacenter card would give. Even so, every
factor matters when one user heating a laptop CPU is the current
ceiling.

Rollback is trivial — drop `runtime: nvidia` and the `devices` block
and redeploy. Ollama silently goes back to CPU.

Follow-up micro-benchmark (`scripts/loadtest/bench-ollama.sh`,
5 distractor-shape prompts × 2 modes via `num_gpu: 0` vs let
Ollama auto-split):

| Metric | CPU only | GPU hybrid 26 % | Δ |
|---|---:|---:|---:|
| Avg output tokens | 60 | 55 | ~same |
| Avg eval latency | 3 506 ms | 1 411 ms | **2.49× faster** |
| Avg total latency | 5 390 ms | 2 174 ms | **2.48× faster** |
| Tokens / sec | 17 | 39 | **2.29× faster** |

In product terms: a fire-and-forget vocab save enrichment goes
from ~5.4 s to ~2.2 s; a burst of five saves goes from ~27 s of
pure-CPU heat to ~11 s of mixed CPU/GPU. Peak CPU temp during
the same burst dropped from 71 °C to ~60 °C. Full report +
NDJSON: `docs/loadtest/bench-20260512-140841/REPORT.md`.

### Load test — 2026-05-11

First end-to-end load run after the `think:false` deploy. Driven by
`scripts/loadtest/run.sh`: SSH-tunnel into `asus:127.0.0.1:8080`
(bypasses nginx so a single laptop can saturate the box), pre-warm
translate + explain disk caches with 10 fixed inputs (one-off
$0.002 OpenAI), then 50 / 50 / 30 VU bursts against `/health` /
cached `/api/translate` / cached `/explain`. Server-side metrics
collected via `scripts/loadtest/collect-metrics.sh` (vmstat /
thermal / docker stats / `ollama ps`).

Full report + raw artifacts: `docs/loadtest/run-20260511-103451/`.

| Scenario       | VU | Duration | Requests | Success | RPS    | p95     |
|----------------|---:|---------:|---------:|--------:|-------:|--------:|
| smoke `/health`| 50 | 30 s     | 15 000   | 100 %   | 500.0  | 20.5 ms |
| translate cached | 50 | 60 s   | 30 000   | 100 %   | 500.0  | 18.5 ms |
| explain cached | 30 | 60 s     | 18 000   | 100 %   | 300.0  | 18.4 ms |

Box stayed almost cold: idle 38 °C → burst 42 °C → cooldown 39 °C
(throttle threshold is 95 °C). System-wide CPU peaked at 12 %; only
the API container worked, peaking at **71 % CPU** under the smoke
run — that is the next ceiling. No memory growth, no rate-limiter
spillover, no disk delta (all cache hits). OpenAI calls during the
stress phase: **0**. 63 000 requests served, zero failures.

### Up next — load testing with LoadSurge

The single-user prod numbers above are honest but limited; "100 readers
all save a vocab word at the same instant" is the next failure mode to
prove or disprove. Plan: a small .NET load harness on top of
[LoadSurge](https://github.com/mrviduus/LoadSurge) (in-house actor-based
load runner, `dotnet add package LoadSurge`). Same language as the
backend, so the test plan lives in the repo and exercises the real
`VocabularyEndpoints.SaveWord` path with a realistic concurrency curve
(ramp 0 → 100 VU over 30 s, hold 5 min). What we want from the run:

- p50 / p95 / p99 translation latency under load (OpenAI-bound — should
  stay flat).
- Distractor success rate under load (Ollama-bound — the interesting
  number, given the single CPU serialises every inference).
- Ollama timeout count vs the post-swap baseline above.

If distractor success craters under concurrency, the fix is a bounded
background queue (`Channels` or Polly bulkhead, `MaxConcurrency=2`) plus
a per-`(word, language)` distractor cache — write once, reuse for every
later user who saves the same term. Translation already has the disk
cache; distractors will get the same treatment.

## [v0.1.0] — 2026-05-06

### Headline

First tagged release of TextStack under **GNU Affero General Public License v3.0**. Earlier development was BUSL-1.1; v0.1.0 onwards is AGPL-3.0 (PR #201). See `release-notes-v0.1.0.md` for the user-facing announcement.

### Library + Mobile parity wave (2026-05-05)

Web library got the duplication / discoverability fixes that surfaced once a real user (mrviduus, 26 uploads) started actually living in it. Mobile then absorbed every web change so iOS/Android shipped in the same shape — no more drift between platforms.

#### Web
- **Shelf "View all →" → dedicated page** ([#203](https://github.com/mrviduus/textstack/pull/203), [#204](https://github.com/mrviduus/textstack/pull/204)) — Continue reading / Recently added / Finished this month each render at `/library/shelf/:id` with the full grid instead of vanishing into a query-string filter.
- **Saved + Uploads merged on /library** ([#204](https://github.com/mrviduus/textstack/pull/204)) — single search, single status-tabs (combined counts), single sort, single grid. Combined merge-sort interleaves both lists; processing/failed uploads pin to top.
- **Add to collection on book detail pages** ([#204](https://github.com/mrviduus/textstack/pull/204)) — new `<AddToCollectionButton>` with `menu` and `button` variants. Wired into kebab, classic detail (when in library), and user-upload detail (when ready).
- **`BookDetailHero` extracted** ([#203](https://github.com/mrviduus/textstack/pull/203)) — cover/title/author/description/meta/actions slots shared by classic and user-upload detail pages. Eliminates the previous duplicate hero markup.
- **Saved cards finally show author** ([#204](https://github.com/mrviduus/textstack/pull/204)) — backend `LibraryItemDto` projects joined author names; combined sort/search use the field; cards render it under the title.
- **Collection sidebar filter applies to both saved + uploads** ([#204](https://github.com/mrviduus/textstack/pull/204)) — parallel fetch of both book-id sets so a single collection click filters everything in unified mode.
- **`status='all'` is the new default** ([#205](https://github.com/mrviduus/textstack/pull/205)) — fresh `/library` no longer applies a hidden Reading filter that silently hid Not-started + Finished books. Sidebar count and grid count finally match.
- **UX polish round 1** ([#218](https://github.com/mrviduus/textstack/pull/218)) — clicking a collection smooth-scrolls to the grid (was an invisible-above-fold change), active chip uses inverted bg/fg + bold + small shadow for Apple-grade visibility in light mode, and Add-to-collection on detail pages becomes a 36×36 circular `+` icon next to share/copy instead of a third giant pill.
- **UX polish round 2** ([#219](https://github.com/mrviduus/textstack/pull/219)) — sidebar is the canonical "+ New collection" entry (chip-row duplicate removed); empty-state chip-row hides entirely; status tabs become `position: sticky` so the active filter stays visible while scrolling a long grid.
- **UX polish round 3** ([#220](https://github.com/mrviduus/textstack/pull/220)) — sticky offset is now `top:80` to match `.site-header` height (no overlap during the collapse animation); destructive `Delete Book` moved out of the primary action row into a quiet "danger zone" text-link below the chapters list (Apple HIG: distance + understatement for destructive actions).
- **UX polish round 4** — Add-to-collection popover gains an inline "+ New collection" form (Apple Notes pattern; no extra dialog); icon buttons get an instant custom CSS hover tooltip instead of the 1-2s delayed native `title=""`; "Delete this book" in the danger zone is now a circular trash icon button matching the `+` icon pattern across the page.
- **UX polish round 5** — drop duplicate `title=""` on icon buttons that already use `aria-label` + custom CSS tooltip (was rendering two tooltips on hover — native after 1s on top of the custom one). Empty-state hint now flows through `aria-label` so the same single tooltip surfaces "Create a collection in the sidebar first" via the custom path.
- **UX polish round 6** — tooltip wraps on narrow viewports. `white-space: nowrap` was clipping the longer empty-state hint at the right edge on phones; now `white-space: normal` + `max-width: min(220px, 100vw - 24px)` keeps it readable across breakpoints. Same fix applied to the delete-icon tooltip.
- **UX polish round 7** — popover state resets on close. Click-outside / Esc / successful pick all flip `expanded:false`, but the `creatingNew` + `newName` state from the inline "+ New collection" form persisted across closes — re-opening landed straight into the input with stale text. Added a small effect that clears both whenever `expanded` becomes false.
- **UX polish round 8** — empty-state pop-over creates inline. Previously `collections.length === 0` made the icon button disabled with a tooltip telling the user to walk over to the sidebar. With the inline create form already living in the popover, that detour was needless: clicking "+ " in empty state now skips the (empty) list and lands directly in the create input.
- **UX polish round 9** — drop dead-code empty-state hint and harden the open-toggle. The grey hint added in round 8 was conditioned `isEmpty && !creatingNew` but the click handler set `creatingNew=true` synchronously on every empty click, so the hint never rendered. Removed the JSX + CSS for it. The click handler now only flips into create-mode when *opening* the popover (was running on close too — harmless but messy).
- **UX polish round 10** — mobile sheet resets on external visibility change. `AddToCollectionSheet` only ran reset() inside its own `handleClose` — when a parent flipped `visible:false` for any other reason (route change, focus loss, programmatic dismiss), `creating` and `newName` persisted into the next open. Same single-effect-on-visible pattern as the web popover (#224).
- **UX polish round 11** — web sidebar drawer mirrors the same reset. `LibrarySidebar` stays mounted and toggles via CSS, so the inline "+ New collection" form state survived re-opens on mobile-shaped viewports. Added a `drawerOpen` prop + effect that clears `creatingCollection` + `newCollectionName` whenever the drawer hides. Desktop sidebar is always visible, so the prop is undefined there and the effect no-ops.
- **Removed 4 unused SEO landing pages** ([#217](https://github.com/mrviduus/textstack/pull/217)) — `/learn-english-{brazil,spain}`, `/read-books-in-english`, `/books-with-translation` plus their components/CSS/routes/sitemap entries/nginx blocks. Not linked, not in sitemap, no traffic signal, three-week stale, and Brazil/Spain shipped with mixed-language UX. ~650 LOC, 23KB JS+CSS gzipped removed.

#### Mobile (iOS + Android)
Same arc, same scope — every web change ported. Shipped over OTA via EAS Updates so existing app installs picked everything up on next launch without a Store rebuild.

- **`DEFAULT_STATUS = 'all'`** ([#206](https://github.com/mrviduus/textstack/pull/206)) — mirror of #205. iOS/Android library now opens with the full collection, not the Reading-only subset.
- **Author on saved cards + sort** ([#207](https://github.com/mrviduus/textstack/pull/207)) — shared `UserLibraryItem` type gains `author`, sortLibraryItems handles author with the same null-rules as uploads, both grid and list views render the author line under the title.
- **Collections support** ([#208](https://github.com/mrviduus/textstack/pull/208)) — shared `collectionsApi` (list/create/update/delete + add/remove/getBookIds). New `useCollections` hook (60s cache + subs). New `<AddToCollectionSheet>` bottom-sheet picker. `useBookActions` accepts `onAddToCollection`; both action sheets prepend it. Detail pages get an "Add to collection" button.
- **Shelf "View all" screens** ([#209](https://github.com/mrviduus/textstack/pull/209)) — `/library/shelf/[shelfId]` route renders a full grid of any shelf; carousel headers gained the link.
- **Sidebar collections section + filter** ([#210](https://github.com/mrviduus/textstack/pull/210)) — drawer renders the user's collections under the source tabs; tapping one filters both saved and uploads in parallel.
- **Auto-refetch on cache invalidation** ([#211](https://github.com/mrviduus/textstack/pull/211), [#212](https://github.com/mrviduus/textstack/pull/212)) — adding a book to the active collection now re-fetches the membership immediately. Implemented via a versioned subscription that landed first as a hand-rolled hook then rewrote on `useSyncExternalStore` for tear-free concurrent reads.
- **EAS Updates wired up** ([#213](https://github.com/mrviduus/textstack/pull/213), [#214](https://github.com/mrviduus/textstack/pull/214)) — `runtimeVersion: { policy: "appVersion" }` + `updates.url` pointing at the existing EAS project. `eas update --platform all` now ships JS-only changes to existing apps without a binary rebuild.
- **Web shim for offlineDb** ([#215](https://github.com/mrviduus/textstack/pull/215)) — `apps/mobile/src/lib/offlineDb.web.ts` no-op stubs unblock `eas update --platform all`. expo-sqlite was pulling its `.wasm` import into the web bundle and crashing the export.
- **dist-web/ added to .gitignore** ([#216](https://github.com/mrviduus/textstack/pull/216)) — prevents test-export artefacts from being committed.



Complete rebuild of the user-owned books experience. From "upload buried 4 clicks deep" to a Kindle-class library with tags, collections, full-text search, AI assistance, and command palette. 20 slices shipped behind feature flags then enabled all-on after stable rollout.

#### Upload UX
- **Persistent upload button in header** ([`28a377c`](https://github.com/mrviduus/textstack/commit/28a377c)) — `+ Upload book` button now lives in the main header on every page; Cmd+U opens the modal from anywhere. Cuts upload from 4 clicks to 1.
- **Drag-and-drop anywhere on web** ([`1592991`](https://github.com/mrviduus/textstack/commit/1592991)) — drop an EPUB / PDF / FB2 onto any page and the upload modal opens with the file pre-loaded. Matches the Notion / Linear / Slack pattern modern users expect.
- **Library empty state is now an active drop zone** ([`d7ec6bb`](https://github.com/mrviduus/textstack/commit/d7ec6bb)) — first-run users see a large drop-zone CTA instead of a passive "no books yet" message. The empty state now teaches the upload action by demonstrating it.

#### Library
- **Continue Reading shelf at the top of Library** ([`34d818e`](https://github.com/mrviduus/textstack/commit/34d818e)) — last-opened books appear as a horizontal shelf so resuming is one tap, not a scan of the grid. The #1 reason users open Library now has a one-tap path.
- **Cover grid with progress and status badges** ([`34d818e`](https://github.com/mrviduus/textstack/commit/34d818e)) — bigger covers, percent-read printed on the cover, and Reading / Finished / Processing / Failed badges that read at a glance. Brings the grid up to Kindle quality.
- **Five-option sort menu** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — Recently opened (default), Recently added, Title, Author, Progress. Replaces the limited 3-option control and matches Kindle / Calibre conventions.
- **Filter chips for reading state** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — All / Reading / Finished / Not started / Failed chips above the grid. Users with 20+ books can now scope to "what am I reading right now" without scrolling.
- **In-library search by title and author** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — search bar filters the grid live as you type. At 50+ books, recall beats browsing.
- **Unified per-book action menu** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — single `BookActionMenu` replaces the two drift-prone menus (saved vs uploaded). Adds Mark finished / unfinished and creates the surface for slices 11+.

#### Power features (tags, collections, search, stats)
- **Editable book metadata** ([`1e74a6a`](https://github.com/mrviduus/textstack/commit/1e74a6a)) — modal to fix title, author, language, genre, and description on uploaded books. Respects user agency when LLM enrichment guesses wrong.
- **Free-form tags on uploaded books** ([`a35ec67`](https://github.com/mrviduus/textstack/commit/a35ec67)) — attach multiple tags (`fantasy`, `for-work`, `2026-reading-list`), filter by tag, and use `tag:` syntax in search. Power-user organization Kindle's collections cannot do.
- **Collections — named shelves** ([`cb255ec`](https://github.com/mrviduus/textstack/commit/cb255ec)) — create shelves like "Summer reading" or "Russian classics" and put books in many at once. Complements tags: tags are facets, collections are intentional groupings.
- **Bulk select + bulk actions** ([`d7b6c6b`](https://github.com/mrviduus/textstack/commit/d7b6c6b)) — multi-select books and apply Mark finished, Add to collection, Add tag, or Delete in one go. Necessary for hygiene at 30+ books.
- **Per-book personal stats page** ([`3f2419e`](https://github.com/mrviduus/textstack/commit/3f2419e)) — book detail now shows hours read, words encountered, vocab saved from this book, highlights count, sessions, and current pace. The data Kindle does not give you.
- **Full-text content search across uploads** ([`e2830ca`](https://github.com/mrviduus/textstack/commit/e2830ca)) — opt-in toggle extends Library search into chapter content via PostgreSQL FTS. "I remember a passage about X" now has an answer.

#### AI + polish
- **AI auto-tag suggestions via Ollama** ([`c3c6d3f`](https://github.com/mrviduus/textstack/commit/c3c6d3f)) — after ingestion, Ollama proposes 3–5 tags from title, author, and the first chapter; one click to accept. Removes the friction of manual tagging from slice 12.
- **Cmd+K command palette** ([`b0f1c74`](https://github.com/mrviduus/textstack/commit/b0f1c74)) — search-driven palette to jump anywhere or run any action in one keystroke. Standard pattern in Linear / Raycast / GitHub — devs and students will recognize it.
- **Reading time estimate per book** ([`9701567`](https://github.com/mrviduus/textstack/commit/9701567)) — "~3h 20m left" on cards and detail pages, computed from the user's actual pace, not a generic 200 wpm. Tiny touch, big perceived smarts.
- **Library stats dashboard strip** ([`391ff64`](https://github.com/mrviduus/textstack/commit/391ff64)) — compact monthly snapshot at the top of Library: pages this month, current streak, goal progress. Surfaces the value of staying in TextStack without forcing users into the Stats page.

#### Cleanup
- **Slice 99 — drop feature flags** ([`08d9de8`](https://github.com/mrviduus/textstack/commit/08d9de8)) — removed 19 flag references and `features.ts`. Features now always-on. Roadmap closed.

### SEO Backfill Automation (2026-04-14)
- **ADR-010** — `docs/ADR-010-seo-backfill-automation.md` describes architecture.
- **Editable prompt templates** — admin panel CRUD (per entity_type × field_type × language), version-frozen on edit.
- **DB-backed queue** — `seo_backfill_jobs` with atomic `FOR UPDATE SKIP LOCKED` claim.
- **Separate systemd poller** — `seo-backfill-poller` (does not mix with `seo-publish-poller`). Setup via `make seo-backfill-setup`.
- **Claude CLI generation** — JSON schema validation with 3 retries on invalid output.
- **Before/After snapshots** — full revert support even after success.
- **Coverage dashboard** — Author/Edition/Genre gap tracking per FieldType.
- **Review gate** — default ON, progressive trust via `trust_level` (manual → review → auto). Strictest wins for multi-field jobs.
- **`seo_source` column** — `manual` | `auto` | `hybrid` on Author/Edition/Genre/BlogPost; auto-skip entities marked `manual`.
- **Prompt injection guard** — `SeoPromptSanitizer` strips role markers (`assistant:`, `system:`) and template delimiters.
- **Admin UI** — `/seo-backfill` with Coverage, Templates, Jobs, Settings tabs.
- **Deploy** — `deploy.yml` restarts `seo-backfill-poller` post-deploy; Makefile `make deploy` mirrors.
- **Deprecates** `docs/seo-content-task.md` manual tracker — migrate to `/seo-backfill`.

### Practice & Review UX Improvements (2026-04-08)
- **Flashcards default mode** — classic flashcards now first and default (was Blitz)
- **Retry wrong words** — optional "Retry wrong words (N)" button on session summary to re-practice mistakes
- **Practice always available** — button never disabled, backend `includeAll` serves non-due words when queue empty
- **Real-time streak badge** — progress ring updates live during review via custom event + optimistic UI
- **Streak goal = 10 words** — progress ring fills to 10, turns green when goal met, amber while in-progress
- **No negative messaging** — removed "keep practicing" tier, lowest is now "Great work!" even at 0%
- **Twemoji flags** — replaced Unicode emoji flags with Twemoji CDN SVGs (fixes Windows rendering)
- **Dark mode badge fix** — explicit colors instead of CSS vars that blended with dark background
- **Popup flicker fix** — outside-click handler uses container ref to avoid toggle race condition
- **No-cards redirect** — review page redirects to practice instead of showing dead-end empty state
- **Vocabulary table on practice page** — shows all words sorted by due date (was "reviewed today" only)
- **Refactor** — removed redundant `NativeLang.flag` field, deduplicated banner/label logic

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
- **Mobile: vocab review overhaul** — ported all web review changes to React Native
  - Blitz (MC) + Classic (FlashCard with 3D flip) modes
  - Haptic feedback (expo-haptics): correct/wrong/flip/complete
  - NewWordCard for stage=0 words, ReviewFeedback (mini/full), SessionSummary with reward tiers
  - Mode selector (Blitz/Classic toggle) on vocabulary index
  - Word list context snippets with bold word in sentence
  - MC fix: `correctOptionIndex` instead of string comparison
  - Removed dead code: ContextCard, fuzzyMatch, levenshtein, inline feedback/summary

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

