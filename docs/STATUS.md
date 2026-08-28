# Status

**Last updated: 2026-08-20.** Where the project actually is — not what it does (that's
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
| **Observability** | OpenTelemetry → Aspire, plus Sentry on API + Worker with LLM/provider-routing spans. Mobile Sentry is wired but **dormant** — set `EXPO_PUBLIC_SENTRY_DSN` to arm it, see [`docs/03-ops/play-store-release.md`](03-ops/play-store-release.md). |
| **Entitlements** | `UserTier { Guest, Free, Supporter, Staff }`, config-driven quotas. |
| **SEO / SSG** | Prerendered pages, sitemap, IndexNow. **Repaired 2026-08-11 after five weeks dead** — see the [postmortem](incidents/2026-08-11-ssg-dead-five-weeks.md). |
| **Mobile** | Android on Play Internal Testing; OTA updates via `expo-updates`. |

## In flight

- **Chunked upload** — 1 of 8 steps done (tiers, PR #449). Files over ~100 MB still fail at
  Cloudflare's per-request body cap with a bare `Upload failed: 413`. Plan:
  `~/.claude/plans/claude-code-task-shimmering-brook.md`.
- **Play Store → production** — needs 12 testers × 14 days on the closed track. Closed track is a
  draft with 0 testers, so the clock has not started. Code-side gates are done: submit profile,
  permission hygiene + guard, honest privacy policy and Data Safety answers, delete-account
  instructions per platform, and a runbook at [`docs/03-ops/play-store-release.md`](03-ops/play-store-release.md).
  The farewell OTA shipped (two updates on `production`/`1.0.0`, 2026-08-26) and the fingerprint
  switch has landed, so builds no longer share one runtime. Still owner-only: promote the current
  build to Closed and recruit 14 testers.

  **Build 22** (`versionCode 22`, runtime `c90afbb0…`) is on Internal Testing and is the first build
  whose runtime is a fingerprint rather than the shared `1.0.0`, so OTAs now have a verified
  delivery target. A manual pass against build 21 found 24 defects —
  [`docs/qa/reports/2026-08-26-android-manual-pass.md`](qa/reports/2026-08-26-android-manual-pass.md).
  23 are fixed (#458-#468); the one that is not is **P2-5**, a notification permission dialog that
  no code path in the app can produce — the only `requestPermissionsAsync` is behind a toggle that
  was Off, and `targetSdkVersion: 36` rules out Android's automatic prompt. Reproduce it on an
  emulator with `adb logcat` before changing anything.

  Not yet verified on a device: the reader chrome work (#463, #467) touches the main reading path,
  and "the bars toggle and the page does not move" is a claim only a phone can settle.
- **Article** — Sentry write-up, draft on vasyl.blog; needs edits, image, publish, then a DEV cross-post.

## Known-broken / open follow-ups

Each of these is a real defect that is *known and not yet fixed*. They live here rather than in
someone's memory.

- ~~**Eleven mobile surfaces have never been tested.**~~ Closed 2026-08-27: the third pass
  ([report](qa/reports/2026-08-27-android-untested-surfaces.md)) walked all eleven. Five clean
  (bookmarks, the vocabulary review session, account deletion, resume after >30 min backgrounded,
  the custom `textstack://` scheme), two broken, four working with defects — nine findings, all
  fixed in #480-#486. Three of the nine were diagnosed differently on re-verification than in the
  report, and the corrections changed the work: `ch.0` was a genuine 0-based ordinal rather than a
  null leaking through; highlight context was already stored in the anchor and only dropped by two
  DTO projections, so it came back retroactively with no migration; and the third-person AI prose
  was a prompt defect, not a screen defect.
- **Mobile Lane A e2e is still the spec, not a suite.** `docs/qa/MOBILE-TEST-PLAN.md` describes it;
  22 tests exist, 34 of their assertions cannot fail (`.catch(() => false)` then `toBeTruthy()`),
  several reference UI deleted in #452/#453, and CI does not run them because they need a live
  backend. Every fix from the QA sweep shipped with pure unit tests instead.
- **No SSG freshness alarm.** The five-week outage was found by a screenshot. Nothing yet alerts on
  "newest generated page is older than N hours" — the single change that would have caught it on day one.
- **Highlight "revisit" has no recall model.** `Highlight` carries only `LastReviewedAt`, and the queue
  is a 24-hour cooldown — no interval, no schedule, no review log, and no field on the request a grade
  could arrive in. The screen is a page-turner and now says so rather than calling itself review.
  Making it real means new columns and an SRS path of its own; deliberately not done for launch.
- **PDF highlights have no context and never will.** Reflow highlights store ~30 characters either side
  in their anchor, so they gained context retroactively. A PDF-rect anchor carries only `exact`; those
  render as the passage alone. Capturing surrounding text at PDF-highlight time is the open follow-up.
- **`selfAssessment` is captured and discarded.** The three-button card ("Forgot / Almost / Knew") sends
  the choice, `SubmitReviewRequest` accepts it, and no server code reads it — so "Almost" differs from
  "Knew" only in the boolean derived from it. Either make the middle button mean something, or drop it.
- **`t()` takes no parameters, so plurals cannot be translated.** `plural()` in `packages/shared` handles
  English one-vs-many in code; strings living in `en.json` (`"{count} highlights"`, `"{count} chapters"`)
  stay hard-plural until the i18n layer accepts a count.
- **iOS Universal Links were never configured.** No `associatedDomains` in `app.json`, empty
  entitlements — the iOS half of this work does not exist yet, on either side.
- **Agent tools still describe themselves more strongly than their payloads support.** An audit of all
  eleven found the same shape as the "you keep missing this word" incident in several more places, and
  three were fixed (history claims, invisible row truncation, chapter numbering). Left, in order of
  how badly each could mislead a reader: `find_earlier_definition` asserts a term was "first introduced"
  in the earliest of eight semantic candidates and, when the spoiler gate hides the real one, states
  the book does not discuss it at all; `get_example_sentence` returns the top RAG chunk without
  checking the word appears in it, under a description promising "a real example sentence";
  `search_library_semantic` degrades silently to keyword search with no field saying so, while its
  description promises meaning-based matching; `LibraryToolShared` surfaces the derived `approxPages`
  where a real page count would go and drops the always-null `pages`, so "312 pages" is shown for a
  book whose length is not stored; `get_user_vocabulary` does not filter retired words and describes
  all of them as "terms the user is already learning". The pattern is consistent: the description
  string is one notch stronger than the projection, and no prompt fix reaches a claim made in a tool
  description.
- **`RetrievedCard` carries no review history**, so the tutor's grounded re-projection cannot re-assert
  what the tools now send — the prompt rule is the only thing enforcing it.
- **Soft-404s to crawlers.** The catch-all nginx `location /` returns 200 for non-SSG paths; the bot-404
  guard exists only in `@spa`.
- **Dead nginx block.** `location /ssg/` aliases a directory that does not exist; the real pages come
  from `apps/web/dist/ssg`, and the block's comment claims it is required.
- **`X-SEO-Render` lies.** It is set from `map $is_bot`, so it reports "you look like a bot", not "SSG
  was served". It cost real debugging time during the SSG incident.
- **`.env.bak*` on the server** — three untracked backups holding live secrets.
- **`EXPO_TOKEN`** repo secret is not set, so the mobile CI build/submit path is unusable; releases go
  from a local machine.
- **Two permission groups still requested and unjustified** — `FOREGROUND_SERVICE` +
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` from `expo-audio` (TTS is foreground-only), and 20 OEM
  launcher/badge permissions from ShortcutBadger via `expo-notifications` (the app never sets a
  badge). Both are on the WATCH list in `apps/mobile/scripts/check-android-permissions.mjs` and need
  a device to settle.
- **Play's Data Safety form still holds the pre-2026-08-20 answers**, which now contradict the
  rewritten privacy policy. The correct answers are recorded verbatim in
  [`docs/03-ops/play-store-release.md`](03-ops/play-store-release.md); submitting them is a manual
  Play Console step. A form that disagrees with the policy is the worst of the three possible states.
- **`llm_traces` grows without bound.** Not an oversight — the policy now says so plainly, and account
  deletion anonymises rather than removes (`ON DELETE SET NULL`). But the table stores prompts and the
  book excerpts sent as context, with no cleanup job, and this project has already lost a night to
  [disk exhaustion](incidents/2026-07-10-backup-leaked-156gb.md). Worth a size check before it is worth
  a retention job.

## Deliberately not doing

Recorded so they stop being re-proposed:

- **Z-Library integration** — declined. The legal public-domain alternative (Gutendex import) is planned
  instead: `~/.claude/plans/textstack-public-domain-discovery.md`.
- **Billing / Stripe / tier upgrade from the UI.** Tiers exist; monetization does not.
- **An admin console over `User`.** Staff is a config allowlist; the population is 1–3 people.
- **Mobile chunked upload.** RN cannot slice an opaque `file://`; the legacy endpoint stays.
- **A UserBooks/Editions shared abstraction** — assessed as false parallelism during the R1–R6 sweep.
- **Python anywhere.** Distillation is TorchSharp + a synthetic teacher.
