# Slice 11 — Editable metadata modal

**Phase:** 3 (Power features) · **Estimated:** 1.5 days · **Risk:** medium · **Flag:** `myBooksV2.editMetadata`

## Goal

Let users fix wrong metadata on their uploaded books — title, author, cover, language, genre. Devs/students hate when LLM enrichment guesses wrong; this respects their agency.

## Acceptance criteria

1. From `BookActionMenu` (slice 10) → "Edit metadata" opens `<UserBookEditModal />`.
2. Modal fields:
   - Title (required, max 200 chars)
   - Author (optional, max 200 chars)
   - Language (dropdown — list of supported langs)
   - Genre (free text or dropdown of common, max 100 chars)
   - Description (textarea, max 2000 chars)
   - Cover — three options: keep current / upload new (image picker, max 5MB, JPEG/PNG/WebP) / select from book's embedded images (FB2 base64, EPUB images)
3. Save button → `PUT /me/books/{id}/metadata` updates DB. Modal closes, card refreshes immediately.
4. Cover upload triggers re-derivation (server resizes to standard sizes).
5. `SeoSource = 'manual'` set on save (using existing `SeoSource` pattern from CLAUDE.md) — protects from auto-overwrite later.
6. Edit history (simple): on each save, prior values stored in JSONB `MetadataHistory` field. Up to 5 versions kept. Out of UI for now — future "undo" feature.
7. Modal validates before submit; shows inline errors; Save disabled until valid.
8. Behind feature flag `myBooksV2.editMetadata`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/UserBookEditModal.tsx` | **New.** Form modal. |
| `apps/web/src/hooks/useUpdateUserBookMetadata.ts` | **New.** API call + cache invalidation. |
| `apps/web/src/components/library/CoverPicker.tsx` | **New.** Three-option picker (keep / upload / from book). |
| `apps/web/src/components/library/BookActionMenu.tsx` | Enable Edit action, hook to modal. |
| `apps/mobile/app/my-books/[id]/edit.tsx` | **New.** Mobile screen (presented modal). |
| Backend: `backend/src/Domain/Entities/UserBook.cs` | Add `MetadataHistory jsonb`, `CoverUploadedAt DateTime?`, `SeoSource string` if not present. |
| Backend: migration `AddEditableMetadataToUserBook` | Migration for new fields. |
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `PUT /me/books/{id}/metadata` endpoint with validation. Add `POST /me/books/{id}/cover` for cover upload. Add `GET /me/books/{id}/cover-candidates` for embedded images. |
| Backend: `backend/src/Application/UserBooks/MetadataService.cs` | **New.** Validates, applies update, snapshots history. |
| `apps/web/src/locales/en.json` + mobile | All field labels, errors, hints. |

## Implementation notes

- **`SeoSource = 'manual'` on save** is critical — your existing SEO Backfill auto-publish pipeline (per CLAUDE.md) respects this. If user edited author manually, don't let LLM overwrite it later.
- **History snapshot:** before applying update, push current values to `MetadataHistory` JSONB array. Trim to last 5 entries server-side. Enables "Undo last change" in future.
- **Cover upload:** validate mimetype + size on backend (don't trust client). Use existing `ImageUtils` from `TextStack.Extraction` for resizing. Store at `data/storage/userbooks/{id}/cover.jpg` (parallel to admin pattern).
- **Cover candidates from book:** for FB2, parse `<binary>` elements; for EPUB, list manifest images. Backend endpoint returns array of `{src, sizeBytes, dimensions}`. Frontend renders thumbnails for picker.
- **Optimistic update:** apply changes to local state immediately, roll back on 4xx/5xx with toast.

## Out of scope

- Bulk edit (edit 5 books at once) — out of scope, niche.
- Editing chapters / TOC — out of scope, that's a re-process flow.
- Editing saved (admin library) books — admin only, out of scope.

## Tests

**Unit:**
- `UserBookEditModal.test.tsx`: validation, disabled state, calls API on submit.
- `MetadataService.test.cs`: history snapshot trims to 5; SeoSource = manual on save.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter UserBooksMetadata`: PUT updates fields, persists, snapshot recorded.

**E2E:**
- Edit book title → save → assert card shows new title immediately AND on reload.
- Upload custom cover → assert cover swaps on card.
- Pick cover from book images → assert applied.
- Save → re-edit → confirm history has prior version (assert via DB or admin endpoint if you expose).

## Done criterion

```bash
pnpm -C apps/web test --filter "UserBookEditModal|CoverPicker|useUpdateUserBookMetadata"
pnpm -C apps/web test:e2e --grep "edit-metadata"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter UserBooksMetadata
dotnet ef migrations script --project backend/src/Infrastructure --startup-project backend/src/Api > /tmp/migration.sql && grep -i "AddEditableMetadataToUserBook" /tmp/migration.sql
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `myBooksV2.editMetadata` to `false`. Action menu hides Edit option. Backend migration is additive — no rollback needed. Existing data unchanged.

## Follow-ups

- Undo last metadata change UI (Phase 4 polish).
- Bulk metadata edit (Phase 4 if requested).
- Sync edited metadata back to original file (out of scope — too risky).
