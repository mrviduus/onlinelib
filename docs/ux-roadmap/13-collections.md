# Slice 13 — Collections (named shelves)

**Phase:** 3 (Power features) · **Estimated:** 1.5 days · **Risk:** medium · **Flag:** `myBooksV2.collections`

## Goal

Manual organization for users with 50+ books. Collections = named shelves (e.g. "Summer reading", "Russian classics", "Work books"). One book can be in multiple collections. Complement to tags — tags are facets, collections are intentional groupings.

## Acceptance criteria

1. New `Collection` entity (Id, UserId, Name, Color, CreatedAt, SortOrder).
2. Many-to-many: `BookCollection (CollectionId, BookId, BookType, AddedAt)`. `BookType ∈ {'userbook', 'savedbook'}`.
3. Library page: a horizontal scrollable row of collection chips ABOVE the filter chips (slice 08). First chip is "All books", then user's collections, then "+ New collection".
4. Selecting a collection chip filters the grid to its books.
5. Per-book menu (slice 10): "Add to collection ▸" submenu lists user's collections + "Create new collection…".
6. Add to collection from book card via context menu OR drag book onto collection chip (web only).
7. Manage collections: dedicated `/library/collections` page — list of collections, rename, change color, reorder by drag, delete (with confirm — books not deleted, just unassociated).
8. Collection deletion: `BookCollection` rows cascade delete. Books unaffected.
9. Behind feature flag `myBooksV2.collections`.

## Files to touch

| File | Change |
|---|---|
| Backend: `backend/src/Domain/Entities/Collection.cs` | **New.** Entity. |
| Backend: `backend/src/Domain/Entities/BookCollection.cs` | **New.** Join entity. |
| Backend: migration `AddCollections` | EF migration with indexes on (UserId), (CollectionId, BookId). |
| Backend: `backend/src/Api/Endpoints/CollectionsEndpoints.cs` | **New.** GET/POST/PUT/DELETE `/me/library/collections`, POST/DELETE `/me/library/collections/{id}/books/{bookId}`. |
| Backend: `backend/src/Application/Collections/CollectionService.cs` | **New.** CRUD, ownership checks. |
| `apps/web/src/components/library/CollectionChips.tsx` | **New.** Horizontal scrollable row. |
| `apps/web/src/components/library/CollectionPicker.tsx` | **New.** Submenu for adding book to collections. |
| `apps/web/src/pages/library/CollectionsPage.tsx` | **New.** Manage page. |
| `apps/web/src/hooks/useCollections.ts` | **New.** CRUD + cache. |
| `apps/web/src/components/library/BookActionMenu.tsx` | Add "Add to collection ▸" item. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<CollectionChips />`, wire selected collection to filter. |
| `apps/mobile/app/library/collections.tsx` | **New.** Mobile manage screen. |
| `apps/mobile/src/components/library/CollectionChips.tsx` | **New.** RN equivalent. |
| `apps/web/src/locales/en.json` + mobile | All collection-related labels. |

## Implementation notes

- **Collection colors:** preset palette of 8 colors mapped to CSS variables. User picks from palette, no custom color picker (keeps theme consistent).
- **Drag-to-add (web):** use HTML5 drag API. Card is draggable, collection chip listens for drop. Uses existing `useDragFileTracker` patterns for visual feedback. Mobile: long-press on card → action sheet → "Add to ▸".
- **URL: `?collection={id}`** combines with existing filter/tag/search params.
- **"All books" chip:** counts include all books across both tabs (Saved + Uploads). Each user collection chip shows its own count.
- **Performance:** `useCollections()` returns enriched list including count via single SQL query (`LEFT JOIN BookCollection`) — don't N+1.
- **Cascade delete safety:** confirm modal explicitly states "Books are NOT deleted, only removed from this collection."

## Out of scope

- Smart collections (auto-include books matching criteria) — Phase 4.
- Sharing a collection (public link) — not in this scope, copyright concerns.
- Importing collections from Goodreads / Calibre — out of scope.

## Tests

**Unit / integration:**
- `CollectionService.test.cs`: ownership check, cascade behavior on delete, max collections per user (suggest 50 limit).
- `useCollections.test.ts`: CRUD round-trips, optimistic add/remove.

**E2E:**
- Create collection "Sci-fi" → add 2 books via menu → click chip → grid shows 2 books.
- Drag a card onto collection chip → assert added (web).
- Delete collection → confirm modal → books still present in main library.
- Manage page: rename, reorder via drag, change color → persists across reload.

## Done criterion

```bash
pnpm -C apps/web test --filter "Collection"
pnpm -C apps/web test:e2e --grep "collections"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter Collections
cd apps/mobile && npx tsc --noEmit

# Migration sanity
dotnet ef migrations script --project backend/src/Infrastructure --startup-project backend/src/Api | grep -i "AddCollections"
```

## Rollback plan

Toggle `myBooksV2.collections` to `false`. UI hides chips, manage page returns 404. Backend tables stay; data preserved.

## Follow-ups

- Smart collections — Phase 4 ("All books finished in 2026").
- Collection cover (composite of first 4 books) — visual polish.
- "Move all books from collection A to B" bulk action.
