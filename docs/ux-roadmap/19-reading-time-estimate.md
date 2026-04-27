# Slice 19 — Reading time estimate per book

**Phase:** 4 (AI + polish) · **Estimated:** 0.5 day · **Risk:** very low · **Flag:** none

## Goal

Show "~3h 20m left" on book cards and book detail pages, based on user's actual reading pace (not generic "200 wpm average"). Tiny touch, big perceived smarts.

## Acceptance criteria

1. Each `UserBookCard` in grid view shows a subtle "Xh Ym left" or "~Y min" label below progress bar (only if pace is known).
2. Detail page (slice 15 stats section) prominently shows estimate next to progress.
3. Pace source: user's overall avg `WordsRead / Minutes` from `ReadingSession` table; fallback to per-book pace from slice 15 if available.
4. If user has < 3 sessions total → fall back to 200 wpm with "(based on average reader)" subtext.
5. Recompute on each Library load (cheap, in `useReadingPace` hook).
6. Mobile: same treatment.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/hooks/useReadingPace.ts` | **New.** Returns `{ paceWpm, isUserSpecific }` cached in localStorage 1h. |
| `apps/web/src/lib/timeEstimate.ts` | **New.** Pure fn: `estimateMinutesRemaining(book, paceWpm) → number`. |
| `apps/web/src/components/library/UserBookCard.tsx` | Add label using estimate. |
| `apps/web/src/components/library/BookStatsSection.tsx` | Use new helper. |
| Backend: `backend/src/Api/Endpoints/ReadingTrackingEndpoints.cs` | Add `GET /me/reading/pace` returning `{wpm, sessionCount, lastUpdated}`. |
| `apps/mobile/...` | Mirror. |
| `apps/web/src/locales/en.json` + mobile | `library.estimate.left`, `library.estimate.fallback`. |

## Implementation notes

- **Calculation:** `minutesLeft = (totalWordCount * (1 - progressPercent/100)) / paceWpm`.
- **Format:** if > 60 min → "Xh Ym"; else "~Y min". If > 50h → "~XX h" no minutes.
- **Don't show** estimate if `totalWordCount` is missing or zero on the book.
- **Cache pace** server-side too (`reading-pace:{userId}`, TTL 1h) — avoid heavy aggregations on every Library render.

## Out of scope

- Per-genre pace adjustment (sci-fi vs nonfiction reads at different speeds) — overkill.
- Real-time pace update during reading session — current scope updates next page load.

## Tests

**Unit:**
- `timeEstimate.test.ts`: 100k words at 200 wpm → 8h 20m; partial progress reduces correctly; zero/null book wordCount returns null.
- `useReadingPace.test.ts`: caches localStorage, refetches after TTL.

**E2E:**
- Book with progress 50%, pace known → assert "~Xh Ym left" visible on card.
- New user (0 sessions) → fallback "(avg reader)" subtext shown.

## Done criterion

```bash
pnpm -C apps/web test --filter "timeEstimate|useReadingPace"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter ReadingPace
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Revert PR. No flag — minor visual addition, easy to remove.

## Follow-ups

- "Finish by Friday" reading goal per book → Phase 4.
- Pace trends: chart of pace over time on Stats page.
