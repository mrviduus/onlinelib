# Slice 14 — Bulk select + bulk actions

**Phase:** 3 (Power features) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.bulkSelect`

## Goal

Select multiple books at once → bulk-apply: Mark finished, Add to collection, Add tag, Delete. Necessary at 30+ books for hygiene.

## Acceptance criteria

1. "Select" button in Library toolbar (next to Sort menu) toggles selection mode.
2. In selection mode: each card shows checkbox top-left; click anywhere on card toggles selection (no navigation).
3. Sticky bottom bar appears showing "{N} selected" + actions: Mark finished · Add to collection ▾ · Add tag ▾ · Delete · Cancel.
4. Cmd/Ctrl+A in selection mode selects all currently visible (respects active filter/search).
5. Esc cancels selection mode.
6. Bulk delete shows confirmation modal listing book titles (max 5 shown + "and N more").
7. Bulk operations atomic where possible (single API call accepting array of IDs). Per-book failure: continue, show summary toast at end.
8. Mobile: long-press on card enters selection mode, taps then toggle. Bottom action bar same.
9. Behind feature flag `myBooksV2.bulkSelect`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/BulkActionBar.tsx` | **New.** Sticky bottom action bar. |
| `apps/web/src/hooks/useLibrarySelection.ts` | **New.** Selection state, toggle, selectAll, clear. |
| `apps/web/src/components/library/UserBookCard.tsx` | Conditional checkbox overlay; click handler routes to toggle in selection mode. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<BulkActionBar />`, provide selection context, "Select" button in toolbar. |
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add bulk endpoints: `POST /me/books/bulk/finish` (body: `{ids: string[], isFinished: bool}`), `POST /me/books/bulk/delete`, `POST /me/books/bulk/tags` (body: `{ids: string[], addTags: string[], removeTags: string[]}`), `POST /me/books/bulk/collection/{id}/add`, `POST /me/books/bulk/collection/{id}/remove`. |
| `apps/mobile/...` | RN equivalent — long-press to enter selection, sticky bar at bottom. |
| `apps/web/src/locales/en.json` + mobile | All bulk action labels and confirmations. |

## Implementation notes

- **Selection state in URL?** No — too noisy. Keep in component state. URL stays clean.
- **Visual change in selection mode:** mute the cards subtly, brighten only selected. Make it obvious you're in a different mode.
- **Atomic bulk endpoints:** server processes in a transaction. Returns `{succeeded: [...], failed: [{id, reason}]}`. Frontend toasts the summary.
- **Bulk delete:** soft delete is safer (set `DeletedAt`, exclude from queries). For now, hard delete with confirm — matches existing single-delete behavior.
- **Performance:** bulk endpoint accepts up to 500 ids per call. Frontend chunks if more.

## Out of scope

- "Move all" between Saved and Uploads tabs (different concepts, doesn't apply).
- Bulk metadata edit — too risky in bulk.
- Bulk re-process — already easy via Failed filter + per-book retry.

## Tests

**Unit:**
- `useLibrarySelection.test.ts`: toggle, selectAll respects current visible filter, clear, max-500 chunk.
- `BulkActionBar.test.tsx`: shows count, disables actions when none selected.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter UserBooksBulk`: each bulk endpoint succeeds, transactional rollback on partial failure.

**E2E:**
- Enter selection → select 3 books → Mark finished → assert all 3 show finished badge.
- Select 5 → Add to collection "Sci-fi" → check collection chip shows +5 count.
- Select all (Cmd+A) → Delete → confirm modal → all gone.
- Mobile: long-press → enter mode → tap two cards → Delete → both gone.

## Done criterion

```bash
pnpm -C apps/web test --filter "useLibrarySelection|BulkActionBar"
pnpm -C apps/web test:e2e --grep "bulk-select"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter UserBooksBulk
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `myBooksV2.bulkSelect` to `false`. "Select" button hidden, bulk endpoints stay (additive), per-book actions unaffected.

## Follow-ups

- Bulk "Re-process" button (after Failed filter) — easy follow-up.
- Bulk export (download all selected as zip) — niche, Phase 4.
