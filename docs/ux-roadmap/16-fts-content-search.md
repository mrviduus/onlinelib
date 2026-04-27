# Slice 16 — Full-text content search across uploads

**Phase:** 3 (Power features) · **Estimated:** 1 day · **Risk:** medium · **Flag:** `myBooksV2.contentSearch`

## Goal

Extend Library search (slice 09) to optionally search inside book content. "I remember a passage about X but not which book" — that question gets an answer.

PostgreSQL FTS already powers public catalog search per CLAUDE.md. We reuse it for user uploads.

## Acceptance criteria

1. Library search bar (slice 09) gains a toggle: "Search inside books" — off by default. When on, query also matches against `UserChapter.SearchVector`.
2. When content matches: card shows excerpt of the matching passage (first match, ~120 chars window with `<mark>` around hit).
3. Click card → opens reader at the matching chapter, highlights the search term in the reader.
4. Search remains debounced (250ms when content-search is on, due to heavier query).
5. Performance: max 50 books returned per query, sorted by relevance (`ts_rank`).
6. Search query supports same `tag:foo` syntax (slice 12) — combine: `tag:fantasy frodo` matches books tagged fantasy with "frodo" in content.
7. Behind feature flag `myBooksV2.contentSearch`.

## Files to touch

| File | Change |
|---|---|
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `GET /me/library/search?q=...&content=true&tags=...`. Returns books with optional `excerpt` field. |
| Backend: `backend/src/Application/UserBooks/UserBookSearchService.cs` | **New.** Builds SQL using `tsvector @@ websearch_to_tsquery` against `user_chapters.search_vector`. JOINs to `user_books`, GROUP BY book id, take MAX(rank), MIN(matching chapter for excerpt). |
| Backend: `backend/src/Domain/Entities/UserChapter.cs` | Verify `SearchVector` column exists (likely yes per CLAUDE.md). If missing, add via migration. |
| Backend: migration `AddSearchVectorToUserChapters` | Only if missing. Use `tsvector_update_trigger`. |
| `apps/web/src/components/library/LibrarySearch.tsx` | Add toggle "Search inside books". |
| `apps/web/src/hooks/useLibrarySearch.ts` | When toggle on, switch from client filter to server search via new endpoint. |
| `apps/web/src/components/library/UserBookCard.tsx` | When `excerpt` present, render below title in muted color. |
| `apps/web/src/pages/ReaderPage.tsx` | Read `?highlight=<query>` param → use existing `useInBookSearch` hook to highlight on load. |
| `apps/mobile/...` | Mirror. |
| `apps/web/src/locales/en.json` + mobile | `library.search.contentToggle`, `library.search.excerpt`. |

## Implementation notes

- **Reuse existing `search_vector` infrastructure** from public catalog. The same trigger that maintains it for `chapters` should already (or trivially) cover `user_chapters`. Verify by reading `PostgresSearchProvider.cs`.
- **Query shape:**
  ```sql
  SELECT 
    ub.id, ub.title, ub.author, ub.cover_path,
    MAX(ts_rank(uc.search_vector, q)) AS rank,
    MIN(ts_headline('english', uc.plain_text, q, 'MaxFragments=1, MinWords=20')) AS excerpt
  FROM user_books ub
  JOIN user_chapters uc ON uc.user_book_id = ub.id
  CROSS JOIN websearch_to_tsquery('english', :query) q
  WHERE ub.user_id = :userId
    AND uc.search_vector @@ q
  GROUP BY ub.id
  ORDER BY rank DESC
  LIMIT 50;
  ```
- **`ts_headline`** returns the excerpt with `<b>...</b>` around hits — strip and re-wrap in `<mark>` on frontend, or use the option `StartSel=<mark>, StopSel=</mark>`.
- **Cancel in-flight requests** when query changes (use AbortController). Otherwise out-of-order responses cause flicker.
- **Index assumption:** GIN index on `user_chapters.search_vector` exists (per CLAUDE.md FTS infra). If not, add via migration.

## Out of scope

- Cross-book results (group by book covered above; per-chapter expanded list is reader's job).
- Multilingual search dictionaries (use English by default; honor book language if available — Phase 4).
- Search across saved (admin library) books from this UI — that's the public search, separate.

## Tests

**Unit:**
- `useLibrarySearch.test.ts`: toggle on switches to server endpoint, debounce 250ms, cancels in-flight.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter UserBookSearch`: query returns expected results, ranks correctly, excludes other users' books, GIN index used (`EXPLAIN`).

**E2E:**
- Upload a book containing the word "petrichor" → toggle on → search "petrichor" → 1 result with excerpt visible. Click → reader opens with word highlighted.
- Combine with `tag:` — `tag:fantasy elf` returns only fantasy-tagged books containing "elf".

## Done criterion

```bash
pnpm -C apps/web test --filter "useLibrarySearch"
pnpm -C apps/web test:e2e --grep "content-search"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter UserBookSearch
cd apps/mobile && npx tsc --noEmit

# Performance smoke: query a user with 100 books, content search responds < 500ms
```

## Rollback plan

Toggle `myBooksV2.contentSearch` to `false`. Toggle hidden in UI; library search reverts to client-side title/author only (slice 09 behavior). Backend endpoint stays (additive).

## Follow-ups

- Multilingual FTS dictionaries — pick `to_tsvector(book.language, ...)` if column known.
- Saved highlights search across all books.
- Reader: tap excerpt → land at exact paragraph (not just chapter).
