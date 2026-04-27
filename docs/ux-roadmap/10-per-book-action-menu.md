# Slice 10 — Per-book action menu unification

**Phase:** 2 (Library MVP) · **Estimated:** 1 day · **Risk:** medium · **Flag:** none (replaces existing menus)

## Goal

Today there are TWO menu components: `BookCardMenu.tsx` (saved books) and `UserBookMenu.tsx` (uploads). Drift is inevitable. Consolidate into one `<BookActionMenu>` that switches actions based on book type.

Add new actions: **Mark as finished / Mark as unfinished**, prepare hooks for slice 11 (Edit metadata) and beyond.

## Acceptance criteria

1. Single `<BookActionMenu book={...} type="saved" | "userbook" />` component used everywhere.
2. Actions per type:
   - **Saved (admin library):** Open · Mark as finished · Remove from library
   - **UserBook (upload):** Open · Mark as finished · Edit metadata (disabled, slice 11) · Re-process (only if Failed) · Cancel (only if Processing) · Download original · Delete
3. "Mark as finished" toggles `IsFinished` on `UserBook` (or equivalent for saved books). Updates progress filter (slice 08) immediately.
4. "Download original" downloads the original file user uploaded (EPUB/PDF/FB2). Backend serves via signed URL or direct stream.
5. Destructive actions (Delete, Remove) require confirmation modal.
6. Menu is keyboard-accessible (arrow keys, Enter, Esc).
7. Mobile: same actions presented as iOS-style action sheet on long-press of card; on tap of 3-dot icon, opens dropdown / sheet.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/BookActionMenu.tsx` | **New.** Replaces `BookCardMenu` + `UserBookMenu`. |
| `apps/web/src/components/library/BookCardMenu.tsx` | Mark `// TODO(my-books-v2 cleanup): remove` — delete after migration. |
| `apps/web/src/components/library/UserBookMenu.tsx` | Same cleanup marker. |
| `apps/web/src/components/library/UserBookCard.tsx` | Use `<BookActionMenu type="userbook" />`. |
| `apps/web/src/components/library/SavedBookCard.tsx` (if exists) | Use `<BookActionMenu type="saved" />`. |
| `apps/web/src/components/library/ConfirmDeleteModal.tsx` | **New if missing.** Reusable delete-confirm modal. |
| `apps/web/src/hooks/useBookActions.ts` | **New.** Encapsulates all action handlers (markFinished, retry, cancel, download, delete). |
| `apps/mobile/src/components/library/BookActionMenu.tsx` | **New.** RN equivalent — Action sheet. |
| Backend: `backend/src/Domain/Entities/UserBook.cs` | Add `IsFinished bool` field if missing. Add `FinishedAt DateTime?` for stats. |
| Backend: migration | EF migration `AddIsFinishedToUserBook`. |
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `PUT /me/books/{id}/finished` (body: `{isFinished: bool}`). Add `GET /me/books/{id}/download` returning original file. |
| `apps/web/src/locales/en.json` + mobile | All new action labels. |

## Implementation notes

- **Single source of truth for actions:** `useBookActions(book, type)` returns `{ markFinished, retry, cancel, download, delete, isLoading }`. Component just renders buttons that call these.
- **Optimistic UI:** `markFinished` updates local state immediately, rolls back on error. Same for `delete` (remove card immediately, restore on failure).
- **`Download original`:** stream the file from server with `Content-Disposition: attachment; filename="<original_name>.epub"`. Add it as a new endpoint to avoid auth-scope issues with existing `/storage/...` static path.
- **Mobile action sheet:** use `@expo/vector-icons` + `ActionSheetIOS.showActionSheetWithOptions` on iOS, custom modal on Android (consistency: use a single library like `react-native-action-sheet` if you want one impl).
- **Cleanup:** old `BookCardMenu` + `UserBookMenu` files MUST stay in repo until slice 99 cleanup OR until grep confirms no usages — whichever first. Mark with `// TODO(my-books-v2 cleanup): remove`.

## Out of scope

- Edit metadata UI — that's slice 11.
- Bulk actions — slice 14.
- Add to collection / Add tags — slices 12/13.

## Tests

**Unit:**
- `BookActionMenu.test.tsx`: shows correct action set per `type`; disables Edit Metadata; conditional Re-process for Failed only.
- `useBookActions.test.ts`: optimistic update + rollback on error for mark/delete.

**E2E:**
- Mark book as finished from menu → assert "Finished" badge appears (slice 06) and book disappears from "Reading" filter (slice 08).
- Failed book → menu → Re-process → assert status changes to Processing then Ready (mock or wait).
- Delete book → confirm modal → assert card removed and not in API on refresh.
- Download original → assert file streamed with correct filename.
- Mobile: long-press card → action sheet appears with correct options.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter UserBooksFinished` — PUT endpoint flips field, GET reflects it.

## Done criterion

```bash
pnpm -C apps/web test --filter "BookActionMenu|useBookActions"
pnpm -C apps/web test:e2e --grep "book-actions"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter UserBooks
cd apps/mobile && npx tsc --noEmit

# Verify cleanup markers present
grep -rE "TODO\(my-books-v2 cleanup\)" apps/web/src apps/mobile/src
# Should show BookCardMenu.tsx, UserBookMenu.tsx, and any other items
```

## Rollback plan

Revert PR. The two old menu components are still in the repo (not deleted, only marked) — restore call sites and the system continues working. Backend migration `AddIsFinishedToUserBook` is additive, no rollback needed.

## Follow-ups

- Slice 11: enable "Edit metadata" action (currently disabled placeholder).
- Slice 14: bulk select mode reuses `useBookActions` for multi-book operations.
- Slice 99: delete the two legacy menu components.
