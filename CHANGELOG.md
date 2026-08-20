# Changelog

Notable changes to TextStack. Newest first.

**How this file works** — three homes, on purpose. This one stays scannable:

| | |
|---|---|
| **`CHANGELOG.md`** (this file) | One line per change, grouped by deploy date. The index. |
| [**`docs/incidents/`**](docs/incidents/README.md) | Postmortems. What broke, why it was invisible, what it taught. |
| [**`docs/changelog-archive/`**](docs/changelog-archive/) | The full write-up behind every line here, preserved verbatim. |
| [**`docs/STATUS.md`**](docs/STATUS.md) | Where the project actually is right now. |

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[CalVer](https://calver.org/) — the deploy date, because TextStack ships to one production
environment on merge and there is no other version anyone can name.

Writing an entry: **one line**, ending with a link. If it needs a paragraph, the paragraph belongs in
the archive; if it broke production, it belongs in `docs/incidents/`. See
[`.claude/commands/changelog.md`](.claude/commands/changelog.md).

---

## [Unreleased]

- **Mobile** — a farewell banner for the frozen `1.0.0` runtime, before the fingerprint switch strands it — mobile · [details](docs/changelog-archive/2026-H2.md#2026-08-20-mobile-a-farewell-banner-for-the-frozen-100-runtime-befor)
- **Reader** — the dyslexic font was a saved GitHub web page on both platforms, so the setting never worked — web + mobile · [details](docs/changelog-archive/2026-H2.md#2026-08-19-reader-the-dyslexic-font-was-a-saved-github-web-page-on-bot)
- **CI** — web unit tests and the whole mobile app were never checked by CI — infra · [details](docs/changelog-archive/2026-H2.md#2026-08-19-ci-web-unit-tests-and-the-whole-mobile-app-were-never-check)
- **Mobile** — Play production plumbing: a submit profile that exists, two permissions that shouldn't, and a guard — mobile + infra · [details](docs/changelog-archive/2026-H2.md#2026-08-19-mobile-play-production-plumbing-a-submit-profile-that-exi)
- **Docs** — CHANGELOG split into an index, an archive and postmortems — docs · [details](docs/changelog-archive/2026-H2.md#2026-08-11-docs-changelog-split-into-an-index-an-archive-and-post)


## [2026.08.11]

- **SEO** — static-site generation had been dead for five weeks; a forbidden HTTP header killed it — backend · [**postmortem**](docs/incidents/2026-08-11-ssg-dead-five-weeks.md) · [details](docs/changelog-archive/2026-H2.md#2026-08-11-seo-static-site-generation-had-been-dead-for-five-weeks-a-fo)

## [2026.08.09]

- **Users** — entitlement tiers replace two hardcoded storage constants — backend · [details](docs/changelog-archive/2026-H2.md#2026-08-09-users-entitlement-tiers-replace-two-hardcoded-storage-consta)

## [2026.08.08]

- **Worker** — provider readiness check + circuit breaker, and a Sentry environment tag that lied — backend + infra · [details](docs/changelog-archive/2026-H2.md#2026-08-08-worker-provider-readiness-check-circuit-breaker-and-a-sentry)

## [2026.08.07]

- **Observability** — Sentry leaked SQL a second way: EF Core error EVENTS, not just breadcrumbs — backend · [**postmortem**](docs/incidents/2026-08-07-sentry-scrubber-leaked-sql.md) · [details](docs/changelog-archive/2026-H2.md#2026-08-07-observability-sentry-leaked-sql-a-second-way-ef-core-error-e)
- **Reader** — reading position was silently lost on concurrent saves (23505 upsert race) — backend · [**postmortem**](docs/incidents/2026-08-07-reading-position-lost-23505.md) · [details](docs/changelog-archive/2026-H2.md#2026-08-07-reader-reading-position-was-silently-lost-on-concurrent-save)

## [2026.08.06]

- **Observability** — Sentry for API + Worker, with LLM agent and provider-routing spans — backend + infra · [details](docs/changelog-archive/2026-H2.md#2026-08-06-observability-sentry-for-api-worker-with-llm-agent-and-provi)

## [2026.07.18]

- **Quality pipeline** — a shifted double-delete could destroy a real chapter (Ivan Ilyich lost chapter I) — infra + backend · [**postmortem**](docs/incidents/2026-07-18-double-delete-destroyed-chapter.md) · [details](docs/changelog-archive/2026-H2.md#2026-07-18-quality-pipeline-a-shifted-double-delete-could-destroy-a-rea)

## [2026.07.17]

- **Mobile** — persistent Book Chat parity (history, markdown, quote-and-ask, spoiler toggle) — mobile + shared · [details](docs/changelog-archive/2026-H2.md#2026-07-17-mobile-persistent-book-chat-parity-history-markdown-quote-an)

## [2026.07.15]

- **Book Chat** — precomputed per-chapter summaries: "summarize chapter N" now draws on a whole-chapter digest — backend · [details](docs/changelog-archive/2026-H2.md#2026-07-15-book-chat-precomputed-per-chapter-summaries-summarize-chapte)
- **RAG** — deterministic tie-breaker on retrieval ORDER BY (repo now matches the article) — backend · [details](docs/changelog-archive/2026-H2.md#2026-07-15-rag-deterministic-tie-breaker-on-retrieval-order-by-repo-now)
- **Upload** — truncated PDFs are caught with a clear message instead of a scary "corrupted" failure — backend + web · [details](docs/changelog-archive/2026-H2.md#2026-07-15-upload-truncated-pdfs-are-caught-with-a-clear-message-instea)
- **Book Chat** — tutor-grade answers: prompt rewrite, gpt-4.1, markdown rendering, 10× token headroom — backend + web · [details](docs/changelog-archive/2026-H2.md#2026-07-15-book-chat-tutor-grade-answers-prompt-rewrite-gpt-4-1-markdow)
- **Book Chat** — "Ask this book" gets persistent history, quote-and-ask, and your highlights as context — backend + web · [details](docs/changelog-archive/2026-H2.md#2026-07-15-book-chat-ask-this-book-gets-persistent-history-quote-and-as)

## [2026.07.14]

- **Reliability** — a slow/hung RAG parse can no longer wedge the indexing worker — backend · [**postmortem**](docs/incidents/2026-07-14-rag-parse-wedged-worker.md) · [details](docs/changelog-archive/2026-H2.md#2026-07-14-reliability-a-slow-hung-rag-parse-can-no-longer-wedge-the-in)
- **Hotfix** — PDF vision-RAG parse routes to gpt-4.1 in the Worker (was Ollama) · [**postmortem**](docs/incidents/2026-07-14-pdf-parse-fell-to-ollama.md) · [details](docs/changelog-archive/2026-H2.md#2026-07-14-hotfix-pdf-vision-rag-parse-routes-to-gpt-4-1-in-the-worker)
- **Reliability** — "Ask this book" indexing no longer gets stuck + reading sessions survive a deleted book — backend + web · [details](docs/changelog-archive/2026-H2.md#2026-07-14-reliability-ask-this-book-indexing-no-longer-gets-stuck-read)
- **Reader** — highlights are now reachable (nav + in-reader drawer/sheet) & translation offers every language — web + mobile · [details](docs/changelog-archive/2026-H2.md#2026-07-14-reader-highlights-are-now-reachable-nav-in-reader-drawer-she)

## [2026.07.13]

- **Reader** — highlights work in the Original-layout PDF reader (web + mobile) · [details](docs/changelog-archive/2026-H2.md#2026-07-13-reader-highlights-work-in-the-original-layout-pdf-reader-web)
- **User books** — metadata enrichment is reliable + visible (description/genre/year) — backend + web + mobile · [details](docs/changelog-archive/2026-H2.md#2026-07-13-user-books-metadata-enrichment-is-reliable-visible-descripti)

## [2026.07.10]

- **Extraction** — drop PDF inline-image extraction for user books (gate, don't delete) — backend (ADR-012 S5a) · [details](docs/changelog-archive/2026-H2.md#2026-07-10-extraction-drop-pdf-inline-image-extraction-for-user-books-g)
- **Mobile** — PDFs render in "Original layout" (PDF.js in the reader WebView) — mobile + shared (ADR-012 S4) · [details](docs/changelog-archive/2026-H2.md#2026-07-10-mobile-pdfs-render-in-original-layout-pdf-js-in-the-reader-w)
- **Reader** — restore the standard chrome in PDF "Original" mode + page bookmarks — web + backend · [details](docs/changelog-archive/2026-H2.md#2026-07-10-reader-restore-the-standard-chrome-in-pdf-original-mode-page)
- **AI quality** — `pdfvision` eval gate scores the PDF vision-RAG feature end-to-end (ADR-012 S3) — backend · [details](docs/changelog-archive/2026-H2.md#2026-07-10-ai-quality-pdfvision-eval-gate-scores-the-pdf-vision-rag-fea)
- **Ask this book** — vision-RAG for PDFs with page citations that jump to the page (ADR-012 S3) — backend + web · [details](docs/changelog-archive/2026-H2.md#2026-07-10-ask-this-book-vision-rag-for-pdfs-with-page-citations-that-j)
- **Reader** — PDF reading progress is page-based (library % + resume) — web + backend (ADR-012 S2) · [details](docs/changelog-archive/2026-H2.md#2026-07-10-reader-pdf-reading-progress-is-page-based-library-resume-web)
- **Reader** — PDFs open instantly, Original-only (ADR-012 S1) — web + backend · [details](docs/changelog-archive/2026-H2.md#2026-07-10-reader-pdfs-open-instantly-original-only-adr-012-s1-web-back)
- **Ops** — root cause: the nightly backup was leaking 156 GB of orphaned pgdata volumes — infra · [**postmortem**](docs/incidents/2026-07-10-backup-leaked-156gb.md) · [details](docs/changelog-archive/2026-H2.md#2026-07-10-ops-root-cause-the-nightly-backup-was-leaking-156-gb-of-orph)
- **Ops** — backup verify self-diagnoses failures + reaps leaked containers — infra · [details](docs/changelog-archive/2026-H2.md#2026-07-10-ops-backup-verify-self-diagnoses-failures-reaps-leaked-conta)
- **Reader** — "Original layout": pixel-perfect PDF view for uploaded books — web + backend · [details](docs/changelog-archive/2026-H2.md#2026-07-10-reader-original-layout-pixel-perfect-pdf-view-for-uploaded-b)

## [2026.07.11]

- **Reader** — hide the misleading word-based % in the PDF Original top bar — web · [details](docs/changelog-archive/2026-H2.md#2026-07-11-reader-hide-the-misleading-word-based-in-the-pdf-original-to)

## [2026.07.09]

- **Auth** — longer sessions: refresh-token TTL 30 → 365 days — backend · [details](docs/changelog-archive/2026-H2.md#2026-07-09-auth-longer-sessions-refresh-token-ttl-30-365-days-backend)
- **Auth** — fix spurious "Unauthorized" mid-session (refresh-token stampede) — web · [**postmortem**](docs/incidents/2026-07-09-refresh-token-stampede.md) · [details](docs/changelog-archive/2026-H2.md#2026-07-09-auth-fix-spurious-unauthorized-mid-session-refresh-token-sta)
- **Library** — drop the shelf carousels, book grid to the top — web · [details](docs/changelog-archive/2026-H2.md#2026-07-09-library-drop-the-shelf-carousels-book-grid-to-the-top-web)
- **PDF reader fixes** — Word/Quartz exports parse cleanly (KMK OSCE model book) — extraction + web/mobile · [details](docs/changelog-archive/2026-H2.md#2026-07-09-pdf-reader-fixes-word-quartz-exports-parse-cleanly-kmk-osce)

---

## Earlier releases

104 entries from 2026-05 to 2026-06 — the AI platform build-out (Phases 1–12), the mobile app, RAG, agents, and the SRS work — are archived in full:

- **2026-06** — 89 entries · [archive](docs/changelog-archive/2026-H1.md)
- **2026-05** — 15 entries · [archive](docs/changelog-archive/2026-H1.md)

Pre-2026 releases: [`docs/changelog-archive/2025-and-earlier.md`](docs/changelog-archive/2025-and-earlier.md)
