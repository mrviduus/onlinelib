# Slice 07 — Sort options (recent / title / author / progress / date added)

**Phase:** 2 (Library MVP) · **Estimated:** 0.5 day · **Risk:** very low · **Flag:** none

## Goal

Replace the limited 3-option sort (`'recent' | 'title' | 'progress'`) with a proper 5-option dropdown that matches Kindle/Calibre conventions: Recently opened (default), Recently added, Title, Author, Progress.

## Acceptance criteria

1. Sort dropdown above the grid with options:
   - **Recently opened** (default) — `last_opened_at DESC NULLS LAST`
   - **Recently added** — `created_at DESC`
   - **Title (A→Z)** — `title ASC`
   - **Author (A→Z)** — `author ASC NULLS LAST`
   - **Progress (most read)** — `progress_percent DESC`
2. Sort selection persists per-user in localStorage (`textstack_library_sort`) and is restored on next visit.
3. Sort applies to BOTH grid view and list view consistently.
4. Sort applies to the active tab (Saved or Uploads) independently — Saved has its own sort state, Uploads has its own.
5. Mobile: same options, same persistence (per-platform storage).
6. Books with `Status != 'Ready'` (Processing, Failed) ALWAYS appear at top regardless of sort — they need attention.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/LibrarySortMenu.tsx` | **New.** Dropdown component with the 5 options. |
| `apps/web/src/pages/LibraryPage.tsx` | Replace inline sort with `<LibrarySortMenu />`. Update `applySort()` logic to handle 5 keys. Move sort state to per-tab via `useLocalStorage` keyed `library_sort_${tab}`. |
| `apps/web/src/hooks/useLibrarySort.ts` | **New.** Encapsulates sort state + comparator. Returns `{ sort, setSort, sortedItems }`. |
| `apps/mobile/src/hooks/useLibrarySort.ts` | **New.** Same logic for RN, uses `AsyncStorage`. |
| `apps/mobile/app/(tabs)/library.tsx` | Same dropdown / picker. Use `<Picker>` or custom action sheet. |
| `apps/web/src/locales/en.json` + mobile | `library.sort.recent`, `library.sort.added`, `library.sort.title`, `library.sort.author`, `library.sort.progress`, `library.sort.label`. |

## Implementation notes

- **Author sort:** use `author` field on the book DTO. If author has multiple entries, sort by first listed. If null, sort to end.
- **`last_opened_at`** field — verify it exists on `UserBookListDto`. If not, add to backend DTO + EF query (one-line addition). For Saved books, it lives on `ReadingProgress` table — JOIN.
- **Sticky-top for Processing/Failed:** apply BEFORE the user's chosen sort. Implementation:
  ```ts
  const partition = (items) => {
    const needsAttention = items.filter(b => b.status !== 'Ready')
    const ready = items.filter(b => b.status === 'Ready')
    return [...needsAttention.sort(byCreatedDesc), ...ready.sort(userSort)]
  }
  ```
- **Don't refetch on sort change** — pure client-side reorder. Backend already returns full list per tab.

## Out of scope

- Server-side sort (premature optimization for current dataset sizes).
- Custom user-defined sort orders ("Drag to reorder my Library") — out of scope.
- Sort by tag / collection — wait for Phase 3.

## Tests

**Unit:**
- `useLibrarySort.test.ts`: 5 sort modes return correct order on a fixture; Processing/Failed always first; persists to localStorage.

**E2E:**
- Open Library → change sort to "Title A→Z" → reload page → assert sort persists.
- Sort "Recently opened" → open second book → return to Library → assert that book moved to top.

## Done criterion

```bash
pnpm -C apps/web test --filter "useLibrarySort"
pnpm -C apps/web test:e2e --grep "library-sort"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Revert PR. Existing 3-sort `'recent' | 'title' | 'progress'` is preserved in git history; can be restored by reverting one commit.

## Follow-ups

- After tags ship (slice 12), add "Most-tagged" and "Group by tag" options.
- After collections ship (slice 13), add "Group by collection" option.
