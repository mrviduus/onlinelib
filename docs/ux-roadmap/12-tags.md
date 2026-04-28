# Slice 12 — Tags (jsonb on UserBook, inline editing)

**Phase:** 3 (Power features) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.tags`

## Goal

User can attach multiple free-form tags to any book (e.g. `fantasy`, `for-work`, `2026-reading-list`). Filter and search by tag. Power-user organization that Kindle's collections can't do.

## Acceptance criteria

1. New field `Tags string[]` (jsonb in Postgres) on `UserBook` (and on a `SavedBook` analog for catalog books).
2. Tag input on book card (hover / focus / inline-edit) AND inside `UserBookEditModal` (slice 11). Click "+" → input field with autocomplete from user's existing tags.
3. Tags rendered as small pills under title on card. Click on pill → filters Library to that tag.
4. Tag autocomplete: as user types, suggest existing tags from their library (case-insensitive substring match).
5. Tag normalization: lowercase, trim, hyphens replace spaces (`"My Favorites"` → `"my-favorites"`).
6. Max 20 tags per book (sane limit).
7. Tag count visible in `LibraryFilters` row (slice 08): "All tags ▾" dropdown shows top 20 tags by usage with counts.
8. Search query syntax extension: `tag:fantasy` filters by tag (combine with text). E.g. `tag:fantasy tolkien` = books tagged fantasy AND containing "tolkien".
9. Behind feature flag `myBooksV2.tags`.

## Files to touch

| File | Change |
|---|---|
| Backend: `backend/src/Domain/Entities/UserBook.cs` | Add `List<string> Tags { get; set; } = new();` mapped to jsonb. |
| Backend: migration `AddTagsToUserBook` | EF migration. |
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `PUT /me/books/{id}/tags` (body: `string[]`). Add `GET /me/library/tags` returning `[{tag, count}]` sorted by count. |
| Backend: `backend/src/Application/UserBooks/TagService.cs` | **New.** Normalize, dedupe, validate. |
| `apps/web/src/components/library/TagInput.tsx` | **New.** Inline pill editor with autocomplete. |
| `apps/web/src/components/library/TagPill.tsx` | **New.** Renders one tag, click → filter. |
| `apps/web/src/components/library/UserBookCard.tsx` | Render tags row. |
| `apps/web/src/components/library/UserBookEditModal.tsx` | Add `<TagInput />`. |
| `apps/web/src/hooks/useUserTags.ts` | **New.** Cached fetch of `/me/library/tags`. |
| `apps/web/src/components/library/LibraryFilters.tsx` | Add "All tags ▾" dropdown. |
| `apps/web/src/lib/searchUtils.ts` | Extend `matchesQuery` to parse `tag:` prefix. |
| `apps/mobile/...` | Mirror in mobile. |
| `apps/web/src/locales/en.json` + mobile | `library.tags.add`, `library.tags.placeholder`, `library.tags.limit`, `library.tags.dropdown`. |

## Implementation notes

- **Why JSONB array, not separate `Tag` + `BookTag` tables:** simpler, fast enough for per-user filter, GIN index gives efficient search, no need for tag entities. Add later if needed.
- **GIN index** on `tags` JSONB column for fast `?` operator queries:
  ```sql
  CREATE INDEX idx_userbooks_tags ON user_books USING GIN (tags);
  ```
- **Autocomplete:** call `useUserTags()` once on Library mount. Cache 60s. Filter client-side by query.
- **Tag pill click:** sets URL `?tag=foo` (separate from `?filter=` and `?q=`), `useLibraryFilter` (slice 08) reads it.
- **Search syntax:** parse query string for `tag:xxx` tokens before applying text search:
  ```ts
  const TAG_RE = /\btag:([a-z0-9-]+)\b/g
  const parseQuery = (q) => {
    const tags = [...q.matchAll(TAG_RE)].map(m => m[1])
    const text = q.replace(TAG_RE, '').trim()
    return { tags, text }
  }
  ```
- **Multi-tag AND**: filter shows only books matching ALL specified tags.

## Out of scope

- Tag colors / icons (visual).
- Tag aliases / merge UI.
- Auto-tags by AI — slice 17.
- Renaming tag globally — out of scope (delete + re-add).

## Tests

**Unit:**
- `TagService.test.cs`: normalize cases, dedupe, max-20 enforce.
- `searchUtils.test.ts`: `parseQuery("tag:fantasy tolkien")` → `{tags: ['fantasy'], text: 'tolkien'}`.
- `TagInput.test.tsx`: autocomplete suggestions appear, Enter adds tag, Backspace on empty input removes last tag.

**Integration:**
- PUT tags → reflected in GET. GIN index used (`EXPLAIN ANALYZE`).

**E2E:**
- Add tag to book → reload → tag persists.
- Click tag pill → URL updates, only matching books shown.
- Search `tag:fantasy` → filters by tag. Search `tag:fantasy tolkien` → AND.

## Done criterion

```bash
pnpm -C apps/web test --filter "TagInput|TagPill|useUserTags"
pnpm -C apps/web test:e2e --grep "tags"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter Tags
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `myBooksV2.tags` flag to `false`. UI hides tag inputs and pills. DB column stays (additive). Existing tag data preserved for re-enable.

## Follow-ups

- Slice 17 AI auto-tags will use this same `Tags` field.
- Tag-based smart-collections ("All books tagged 'fantasy' that are unfinished").
