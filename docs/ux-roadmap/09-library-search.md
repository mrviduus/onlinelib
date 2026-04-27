# Slice 09 — In-library search (title + author)

**Phase:** 2 (Library MVP) · **Estimated:** 1 day · **Risk:** low · **Flag:** none

## Goal

Search bar inside the Library that filters by title AND author. With 50+ books grid scanning fails — search is the recall path.

This slice does NOT include full-text content search across chapters — that's slice 16 (heavier, separate).

## Acceptance criteria

1. Search input in Library header area, prominent, with magnifier icon and placeholder "Search your library…".
2. Typing filters the displayed list in real-time (debounced 150ms) by case-insensitive substring match on `title` OR `author`.
3. Search combines with active filter chip (slice 08) and sort (slice 07): filter → search → sort.
4. Empty state when search returns 0 results: "No books match '{query}'" + "Clear search" button.
5. Esc clears the search input and refocuses it.
6. Cmd+F / Ctrl+F focuses the search input (overrides browser find — confirmed acceptable per design call). Mobile: tap on icon focuses.
7. Search query is reflected in URL `?q=...` for shareability.
8. Search applies independently per tab (Saved vs Uploads).
9. Search bar is sticky at top of Library while scrolling (sticky position).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/LibrarySearch.tsx` | **New.** Search input + clear button. |
| `apps/web/src/hooks/useLibrarySearch.ts` | **New.** Encapsulates query state, debounce, URL sync. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<LibrarySearch />` at top of content area, wire `query` to displayed list. |
| `apps/web/src/lib/searchUtils.ts` | **New.** Tiny pure-fn `matchesQuery(book, query)` — handles diacritics via `Intl.Collator`. |
| `apps/mobile/src/components/library/LibrarySearch.tsx` | **New.** RN `<TextInput>` based. |
| `apps/mobile/app/(tabs)/library.tsx` | Same wiring. |
| `apps/web/src/locales/en.json` + mobile | `library.search.placeholder`, `library.search.empty`, `library.search.clear`, `library.search.shortcut`. |

## Implementation notes

- **Pure client-side search** — no API calls. The full library is already loaded in `LibraryPage`.
- **Diacritic-insensitive:** "Tolstoï" matches "tolstoi", "Frankenstein" matches "Frankenštein". Use:
  ```ts
  const collator = new Intl.Collator('en', { sensitivity: 'base' })
  // Comparator returns 0 for matching base letters regardless of accent
  ```
  For substring search: normalize both strings to NFD, strip combining marks, then compare:
  ```ts
  const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const matchesQuery = (book, q) => {
    const nq = normalize(q)
    return normalize(book.title).includes(nq) || normalize(book.author ?? '').includes(nq)
  }
  ```
- **Debounce:** use `useDebounce` hook (already in codebase per CLAUDE.md). 150ms feels instant but avoids per-keystroke filter on large libraries.
- **Sticky positioning:** `position: sticky; top: ${headerHeight}px; z-index: 10` on search container. Test that it doesn't overlap with `Continue Reading` shelf (slice 05).
- **URL sync:** same `useSearchParams` pattern as filter (slice 08). On clear, remove `?q=` from URL.

## Out of scope

- Full-text content search → slice 16.
- Search across all of TextStack (homepage search bar) — that's the public catalog search, separate.
- Fuzzy match / typo tolerance — overkill for title+author search at current dataset sizes. Substring is enough.
- Search history / suggestions — Phase 4 if needed.

## Tests

**Unit:**
- `searchUtils.test.ts`: matchesQuery handles base case, diacritics, multi-word query, empty query (returns true).
- `useLibrarySearch.test.ts`: debounces, URL syncs, Esc clears.

**E2E:**
- Library with "Война и мир", "War and Peace", "Anna Karenina" → search "war" → 1 result. Clear → 3 results.
- Cmd+F focuses search → type → results filter → Esc clears + refocuses.
- Search URL deeplink: visit `/library?q=tolstoy` → results pre-filtered.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibrarySearch|useLibrarySearch|searchUtils"
pnpm -C apps/web test:e2e --grep "library-search"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Revert PR. No data changes.

## Follow-ups

- Slice 16: extend search to look inside chapter content (full-text). Search bar UI stays the same; backend gets a new endpoint that uses existing PostgreSQL `search_vector`.
- Add "search by tag" syntax `tag:fantasy` — Phase 3 after tags ship.
