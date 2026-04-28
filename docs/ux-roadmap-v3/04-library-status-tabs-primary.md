# Slice 04 — Status as primary horizontal tabs (Reading / Finished / Not started)

**Phase:** 2 (Library restructure) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV3.statusTabsPrimary`

## Goal

Promote v2 slice 08 filter chips (`All / Reading / Finished / Not started / Failed`) to **primary horizontal tabs** at the top of the Library grid. Status is the most-used filter; deserves first-class real estate. Mirrors Readwise's `INBOX | LATER | ARCHIVE` pattern (research doc).

## Acceptance criteria

1. Top of Library center column (above grid, below sidebar selection): horizontal tab bar with **3 primary tabs** + 2 secondary:
   - **Reading** (default) — books with progress > 0 AND < 95%
   - **Finished** — `IsFinished` OR progress ≥ 95%
   - **Not started** — books in library with progress = 0
   - **Failed** — only shown when count > 0 (status = Failed from ingestion)
   - **All** — last position, less prominent (smaller tab or "View all" link)
2. **Default tab = Reading** (changed from old default "All"). User who lands in Library most often wants to continue reading something.
3. Active tab visually distinct (underline + bold + count badge).
4. Tab combines with all other filters (sidebar source from slice 03, search from v2 slice 09, sort from v2 slice 07).
5. v2 slice 08 filter chips component (`LibraryFilters.tsx`) **removed** — superseded by tabs.
6. URL: `?status=reading` (default omitted), `?status=finished`, etc.
7. Empty state per tab:
   - Reading empty → "Open a book to start reading"
   - Finished empty → "Finish your first book this month"
   - Not started empty → "Looking good — you're on top of your library"
   - Failed → only shown when populated, message: "These uploads need attention"
8. Mobile: tabs render as horizontal scrollable strip; "Failed" tab badge color = red.
9. Behind `myBooksV3.statusTabsPrimary`. When OFF, v2 filter chips render.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/LibraryStatusTabs.tsx` | **New** — replaces `LibraryFilters.tsx`. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<LibraryStatusTabs />` instead of filter chips. |
| `apps/web/src/components/library/LibraryFilters.tsx` | Mark `// TODO(my-books-v3 cleanup): remove`. |
| `apps/web/src/hooks/useLibraryFilter.ts` | Refactor: rename to `useLibraryStatus`, drop multi-filter chips concept. |
| `apps/mobile/src/components/library/LibraryStatusTabs.tsx` | **New** RN equivalent. |
| `apps/mobile/app/(tabs)/library.tsx` | Same swap. |
| `apps/web/src/locales/en.json` + mobile | New empty-state strings. Old `library.filter.*` keys marked for cleanup. |
| `infra/env/...` | `VITE_FEATURE_MYBOOKSV3_STATUS_TABS_PRIMARY=true`. |

## Implementation notes

- **Default = Reading** is the most opinionated change. Justification: a logged-in user opening Library most often wants to continue what they were reading, not browse the whole catalog. If telemetry post-launch shows otherwise, change to "All".
- **"Failed" tab visibility:** show only when count > 0. Don't pollute UI for users who never hit ingestion failures.
- **Empty state copy matters** — these are read by users who DON'T have books in that status. Be encouraging, not blank.
- **"All" tab demotion:** options:
  - Smaller tab on the right side
  - Or a "Show all" link below the tabs
  Recommend smaller tab — keeps spatial consistency.
- **Combine logic:** filter rules same as v2 slice 08; just promoted from chip to tab. Migration is mostly UI swap.

## Out of scope

- New status types beyond what v2 already implements.
- "Snoozed" / "Inbox" pattern — books aren't articles; doesn't fit (per research doc).
- Status changes from this UI — that's in `BookActionMenu` (v2 slice 10).

## Tests

**Unit:**
- `LibraryStatusTabs.test.tsx`: renders 3+1+1 tabs, hides Failed when 0, sets default to Reading.
- `useLibraryStatus.test.ts`: URL sync, combines with source/tag/search.

**E2E:**
- Library with 5 books: 2 reading, 1 finished, 2 not started → tabs show counts (2, 1, 2). Default tab Reading shows 2 books.
- Click Finished → URL `?status=finished`, grid shows 1 book.
- Reload → still on Finished tab.
- Mobile: tabs horizontally scroll, no overflow.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibraryStatusTabs|useLibraryStatus"
pnpm -C apps/web test:e2e --grep "library-status-tabs"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_STATUS_TABS_PRIMARY=false`. Filter chips render. Old code path preserved until slice 06 cleanup.

## Follow-ups

- A/B test default tab ("Reading" vs "All") if telemetry shows ambiguity.
- Per-user pref: "Default tab on Library open" in settings.
- "Last opened" status (different from Reading — book opened but no session yet).
