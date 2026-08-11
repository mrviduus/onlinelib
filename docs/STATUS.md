# Status

**Last updated: 2026-08-11.** Where the project actually is — not what it does (that's
[`docs/README.md`](README.md)) and not what changed (that's [`CHANGELOG.md`](../CHANGELOG.md)).

If you read one page before picking work back up, read this one. It exists because the changelog
answers "what happened" and nothing answered "what is half-finished right now".

> **Keeping it honest:** update this file whenever something moves between the three lists below.
> A `/pr` that finishes a line here should delete or move that line in the same PR.

---

## Shipped and live

| Area | State |
|---|---|
| **Reader** (web + mobile) | EPUB + PDF. PDFs are original-first ([ADR-012](01-architecture/adr/ADR-012-pdf-original-first-lazy-parse.md)), page-based progress, highlights, TTS, vocabulary SRS. |
| **AI platform** | Phases 1–12 complete: RAG, agents (Enrichment / Tutor / Librarian), evals, shadow routing, cost-aware routing, drift detection. |
| **Book Chat** | Streaming, persistent history, per-chapter summaries, page citations for PDFs. Web + mobile at parity. |
| **Observability** | OpenTelemetry → Aspire, plus Sentry on API + Worker with LLM/provider-routing spans. |
| **Entitlements** | `UserTier { Guest, Free, Supporter, Staff }`, config-driven quotas. |
| **SEO / SSG** | Prerendered pages, sitemap, IndexNow. **Repaired 2026-08-11 after five weeks dead** — see the [postmortem](incidents/2026-08-11-ssg-dead-five-weeks.md). |
| **Mobile** | Android on Play Internal Testing; OTA updates via `expo-updates`. |

## In flight

- **Chunked upload** — 1 of 8 steps done (tiers, PR #449). Files over ~100 MB still fail at
  Cloudflare's per-request body cap with a bare `Upload failed: 413`. Plan:
  `~/.claude/plans/claude-code-task-shimmering-brook.md`.
- **Play Store → production** — needs 12 testers × 14 days on the closed track. Closed track is a
  draft with 0 testers.
- **Article** — Sentry write-up, draft on vasyl.blog; needs edits, image, publish, then a DEV cross-post.

## Known-broken / open follow-ups

Each of these is a real defect that is *known and not yet fixed*. They live here rather than in
someone's memory.

- **No SSG freshness alarm.** The five-week outage was found by a screenshot. Nothing yet alerts on
  "newest generated page is older than N hours" — the single change that would have caught it on day one.
- **Soft-404s to crawlers.** The catch-all nginx `location /` returns 200 for non-SSG paths; the bot-404
  guard exists only in `@spa`.
- **Dead nginx block.** `location /ssg/` aliases a directory that does not exist; the real pages come
  from `apps/web/dist/ssg`, and the block's comment claims it is required.
- **`X-SEO-Render` lies.** It is set from `map $is_bot`, so it reports "you look like a bot", not "SSG
  was served". It cost real debugging time during the SSG incident.
- **Edition progress double-counts** the book-wide % on the public shelf (user-books were fixed in #412).
- **`.env.bak*` on the server** — three untracked backups holding live secrets.
- **`EXPO_TOKEN`** repo secret is not set, so the mobile CI build/submit path is unusable; releases go
  from a local machine.

## Deliberately not doing

Recorded so they stop being re-proposed:

- **Z-Library integration** — declined. The legal public-domain alternative (Gutendex import) is planned
  instead: `~/.claude/plans/textstack-public-domain-discovery.md`.
- **Billing / Stripe / tier upgrade from the UI.** Tiers exist; monetization does not.
- **An admin console over `User`.** Staff is a config allowlist; the population is 1–3 people.
- **Mobile chunked upload.** RN cannot slice an opaque `file://`; the legacy endpoint stays.
- **A UserBooks/Editions shared abstraction** — assessed as false parallelism during the R1–R6 sweep.
- **Python anywhere.** Distillation is TorchSharp + a synthetic teacher.
