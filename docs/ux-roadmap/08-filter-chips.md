# Slice 08 — Filter chips (All / Reading / Finished / Not started / Failed)

**Phase:** 2 (Library MVP) · **Estimated:** 0.5 day · **Risk:** very low · **Flag:** none

## Goal

Add quick filter chips above the grid for common reading states. Users with 20+ books need a way to scope to "what am I reading right now" or "what failed processing" without scrolling.

## Acceptance criteria

1. Chip row above the grid (below sort), horizontally scrollable on mobile:
   - **All** (default, shows count badge `(N)`)
   - **Reading** — books with progress > 0 AND < 95%
   - **Finished** — progress ≥ 95% OR explicit `IsFinished == true` (added in slice 10)
   - **Not started** — books in library with progress = 0
   - **Failed** — `status == 'Failed'` (only visible if any failed exist; otherwise chip hidden)
2. Each chip shows count badge.
3. Selecting a chip filters the grid AND list view; combines with sort (slice 07).
4. Filter selection persists per-user in localStorage (`textstack_library_filter`) per tab.
5. URL query param `?filter=reading` reflects state — supports deep links.
6. Multi-select NOT supported in this slice (single chip at a time). Multi-select reserved for tags (slice 12).
7. Empty state when filter returns 0 results: "No books match this filter" + "Clear filter" button.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/LibraryFilters.tsx` | **New.** Chip row component. |
| `apps/web/src/hooks/useLibraryFilter.ts` | **New.** Filter state + computed filtered list. URL-sync via `useSearchParams`. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<LibraryFilters />`. Wire filter to displayed list. |
| `apps/mobile/src/components/library/LibraryFilters.tsx` | **New.** RN equivalent — horizontal `<ScrollView>` of `<TouchableOpacity>` chips. |
| `apps/mobile/app/(tabs)/library.tsx` | Same wiring. |
| `apps/web/src/locales/en.json` + mobile | `library.filter.all`, `library.filter.reading`, `library.filter.finished`, `library.filter.notStarted`, `library.filter.failed`, `library.filter.empty`, `library.filter.clear`. |

## Implementation notes

- **Filter logic centralized.** Every filter rule expressed as a predicate:
  ```ts
  const FILTERS = {
    all: () => true,
    reading: (b) => b.progressPercent > 0 && b.progressPercent < 95,
    finished: (b) => b.progressPercent >= 95 || b.isFinished,
    notStarted: (b) => b.progressPercent === 0 && !b.isFinished,
    failed: (b) => b.status === 'Failed',
  }
  ```
- **Counts computed from full list, not filtered list.** `(N)` badge always reflects total in that filter, regardless of what's currently selected.
- **`Failed` chip hidden when count = 0.** Clean UI — don't show 0-count chips.
- **Combine with sort:** filter first, then sort. Already aligned in `useLibrarySort` from slice 07.
- **URL sync:** use `useSearchParams()` from React Router. Update `?filter=` on chip click via `setSearchParams` with `{ replace: true }` to avoid history pollution.

## Out of scope

- Multi-tag filter UI — slice 12.
- Filter by tag — Phase 3.
- "Recently added in last 7 days" filter — too granular, sort by date covers it.

## Tests

**Unit:**
- `useLibraryFilter.test.ts`: each filter predicate matches expected fixture subset; counts correct; URL sync round-trips.
- `LibraryFilters.test.tsx`: renders chips, hides Failed when 0, shows count badges.

**E2E:**
- Library with 10 books, 2 reading, 1 failed → chips show counts (10, 2, 0, 7, 1). Click "Reading" → 2 cards visible. Reload → still on Reading filter.
- Click "Reading" → URL becomes `?filter=reading`. Visit URL directly → filter applied.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibraryFilters|useLibraryFilter"
pnpm -C apps/web test:e2e --grep "library-filter"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Revert PR. Filter state defaults back to "All" implicitly; nothing else broken.

## Follow-ups

- After tags ship (slice 12), add tag chips alongside state chips.
- "Smart filters" (e.g. "Long reads", "In your native language") — Phase 4.
