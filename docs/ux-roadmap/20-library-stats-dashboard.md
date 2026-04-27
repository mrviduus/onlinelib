# Slice 20 — Library stats dashboard

**Phase:** 4 (AI + polish) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.libraryStatsHeader`

## Goal

Compact stats strip at the top of Library showing the user's monthly snapshot: pages this month, current streak, goal progress. Surfaces the value of staying in TextStack and ties Library to the existing Stats / Goals features without forcing users to open them.

## Acceptance criteria

1. Above the Continue Reading shelf (slice 05), a horizontal stats strip with 3–4 tiles:
   - **Pages this month** (or words, depending on what user picked in Stats settings)
   - **Current streak** (days in a row reading) — link to Stats page
   - **Goal progress** — IF user has a `ReadingGoal` set, progress bar with N/M; otherwise CTA "Set a goal"
   - **Books finished YTD**
2. Tiles are dense, single-line, link/tap to the relevant Stats / Goals deep page.
3. Strip is collapsible — chevron on right side, "Hide" remembered in localStorage. Default visible.
4. Mobile: vertical stack of 2 tiles + "More" link to full Stats page (don't crowd phone screen).
5. Behind feature flag `myBooksV2.libraryStatsHeader`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/LibraryStatsHeader.tsx` | **New.** Strip with 4 tiles. |
| `apps/web/src/hooks/useLibraryStatsSummary.ts` | **New.** Fetches + caches dashboard summary. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount above Continue Reading shelf. |
| Backend: `backend/src/Api/Endpoints/ReadingTrackingEndpoints.cs` | Add `GET /me/reading/library-summary` returning `{pagesThisMonth, currentStreak, currentGoal, booksFinishedYtd}` — single endpoint to avoid 4 calls. |
| Backend: `backend/src/Application/ReadingTracking/LibrarySummaryService.cs` | **New.** Aggregates from existing `ReadingSession`, `ReadingGoal`, `UserBook.IsFinished`. |
| `apps/mobile/...` | Vertical mirror, 2 tiles. |
| `apps/web/src/locales/en.json` + mobile | All tile labels. |

## Implementation notes

- **Re-use existing entities only.** Streak, goals, sessions all exist (per CLAUDE.md). This slice adds aggregation + UI.
- **Single endpoint for efficiency.** Don't make Library page fire 4 stats calls — one summary call, server-aggregated, cached 5 min in Redis or in-memory.
- **Streak calc:** standard "consecutive days with ≥1 reading session." Existing `ReadingStats` likely has this — verify and reuse.
- **Goal progress:** if `daily_minutes` goal → "X/Y min today"; if `books_per_year` → "X/Y books in 2026."
- **Empty states inside tiles:**
  - Pages this month: 0 → "Read your first pages today"
  - Streak: 0 → "Start a streak"
  - Goal: none → "Set a reading goal" CTA
  - Books finished: 0 → "Finish your first book this year"
- **Collapsed state:** small chevron + "Stats" label remains visible. Click expands.

## Out of scope

- Charts (heatmap, trend lines) — those live on full Stats page, not here.
- Comparing to other users — out of scope.
- Multi-month / yearly view — Stats page handles.

## Tests

**Unit:**
- `LibrarySummaryService.test.cs`: streak / pages / books-ytd computed correctly from fixtures.
- `LibraryStatsHeader.test.tsx`: renders 4 tiles, collapsed state persists, empty states for new users.

**Integration:**
- Endpoint returns expected shape; respects user scope; cached.

**E2E:**
- Visit Library → assert strip visible with non-zero values for active user.
- Click "Set a goal" → land on Stats / Goals page.
- Collapse → reload → still collapsed.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibraryStatsHeader|useLibraryStatsSummary"
pnpm -C apps/web test:e2e --grep "library-stats-header"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter LibrarySummary
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `myBooksV2.libraryStatsHeader` to `false`. Strip hidden, endpoint untouched.

## Follow-ups

- Add same strip to homepage as a passive "today" signal.
- Add weekly digest email leveraging the same summary endpoint.
