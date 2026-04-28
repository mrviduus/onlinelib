# Slice 02 — Drag-and-drop anywhere on web

**Phase:** 1 (Upload UX fix) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.globalDropZone`

## Goal

User can drop an EPUB / PDF / FB2 file anywhere on the web app and it triggers the upload modal with the file pre-loaded. Pattern from Notion / Linear / Slack — modern users expect this.

Today, drag-drop only works inside `UploadSection` on `/library` Uploads tab.

## Acceptance criteria

1. Dragging a file (any type) over any page of the web app shows a full-screen overlay: dimmed backdrop + centered dashed dropzone with text "Drop to upload your book — EPUB, PDF, or FB2".
2. Dropping a **valid** file (EPUB / PDF / FB2 by extension AND mimetype) opens the `UploadModal` (slice 01) with that file pre-selected, ready to confirm + upload.
3. Dropping an **invalid** file shows a toast "Unsupported file. Use EPUB, PDF or FB2." and does nothing else.
4. Dropping multiple files: first file is loaded into modal, others queued — modal shows "1 of N — next: ...". Queue processes sequentially after each upload completes.
5. Overlay does NOT appear when dragging text, links, or images (only when `dataTransfer.types` contains `'Files'`).
6. Overlay is suppressed if upload modal is already open (avoid double-trigger), if reader iframe has the dragged target (avoid hijacking text-selection), or if `Header.tsx` upload modal is currently submitting.
7. Unauthenticated users: dropping a file shows toast "Sign in to upload books" with a "Sign in" action button.
8. Behind feature flag `myBooksV2.globalDropZone`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/GlobalDropZone.tsx` | **New.** Mounts at `App.tsx` level. Listens to `dragenter` / `dragover` / `dragleave` / `drop` on `document`. Renders portal overlay when active. |
| `apps/web/src/App.tsx` | Mount `<GlobalDropZone />` inside the auth-aware tree (so it has access to `useAuth()`). |
| `apps/web/src/hooks/useDragFileTracker.ts` | **New.** Tracks drag-enter depth (counter pattern — `dragleave` fires for every child too) and exposes `{ isDragging, files }` reactively. |
| `apps/web/src/components/library/UploadModal.tsx` | Extend props to accept `initialFile?: File` and `queue?: File[]` so it can be opened pre-loaded. |
| `apps/web/src/lib/uploadFileValidation.ts` | **New.** Single source of truth for "is this file uploadable" — extension + mimetype check. Reused by drop handler, file picker, and `UploadSection`. |
| `apps/web/src/lib/features.ts` | Add `myBooksV2.globalDropZone` flag. |
| `apps/web/src/lib/telemetry/myBooksV2.ts` | Add events: `dropzone.activated`, `dropzone.dropped`, `dropzone.invalid_file`. |
| `apps/web/src/locales/en.json` | Add keys: `dropzone.title`, `dropzone.subtitle`, `dropzone.invalid`, `dropzone.signin_required`. |
| `apps/web/src/styles/dropzone.css` | **New.** Backdrop, dropzone box, animations. |

## Implementation notes

**Drag-enter / drag-leave depth counter** is critical. `dragleave` fires whenever the cursor crosses ANY child element border, so a naive `onDragLeave={hide}` will flicker. Use:

```ts
let depth = 0
document.addEventListener('dragenter', e => {
  if (!e.dataTransfer?.types.includes('Files')) return
  depth++
  if (depth === 1) setIsDragging(true)
})
document.addEventListener('dragleave', e => {
  depth--
  if (depth === 0) setIsDragging(false)
})
document.addEventListener('drop', () => { depth = 0; setIsDragging(false) })
```

**Prevent default on `dragover`** — without this, drop events do not fire because the browser interprets it as a navigation:

```ts
document.addEventListener('dragover', e => e.preventDefault())
```

**Reader iframe edge case:** if user is inside `/read/...` and drags text from the book, do NOT activate dropzone. Check `e.target` — if it's inside `iframe` or has class `reader-content`, ignore. Or simpler: only trigger when `dataTransfer.types` contains `'Files'` (text drags don't include this).

**Validation:** allow extensions `.epub`, `.pdf`, `.fb2`, `.fb2.zip`. Mimetype check is unreliable (browsers are inconsistent) — **use extension as primary, mimetype as soft hint**. Centralize in `uploadFileValidation.ts`.

## Out of scope

- Mobile (no drag-drop concept, slice 03 covers mobile entry).
- Server-side virus scanning (existing pipeline handles this).
- Drag-drop into specific zones (e.g. drag onto a Collection to add to it) — that is post-Phase 3.

## Tests

**Unit:**
- `useDragFileTracker.test.ts`: depth counter handles nested elements, only triggers for files, cleans up on drop.
- `uploadFileValidation.test.ts`: accepts `.epub`, `.pdf`, `.fb2`, `.fb2.zip`; rejects `.txt`, `.docx`, `image.png`.

**E2E (Playwright):**
- Drag a fixture file from disk over the page → assert overlay appears → drop → assert modal opens with file name visible.
- Drag invalid file → assert toast appears, modal does NOT open.
- Drag while unauthenticated → assert sign-in toast.

Use Playwright's `dispatchEvent('drop', { dataTransfer })` API since real OS drag-drop isn't easily simulated.

## Done criterion

```bash
pnpm -C apps/web test --filter "GlobalDropZone|useDragFileTracker|uploadFileValidation"
pnpm -C apps/web test:e2e --grep "drag-drop"
pnpm -C apps/web build

# Manual smoke
# - Drag .epub from Finder onto /en, /en/books/dracula, /en/library, /en/read/...:
#   - First three: overlay shows, drop works
#   - Reader page: dragging text from book does NOT trigger overlay
# - Drag .docx → invalid toast shown
# - Drag while logged out → signin toast
# - Drag 3 files at once → first opens modal, "1 of 3 — next: ..." visible
```

## Rollback plan

Toggle `myBooksV2.globalDropZone` to `false`. Local drag-drop in `UploadSection` (Library page) remains untouched and continues to work.

## Follow-ups

- After Phase 3 collections ship: extend dropzone to detect drop target — drop on a Collection card adds the uploaded book to it directly.
- Add browser-extension hint after first successful drop: "Tip: install our Chrome extension to drop URLs to read."
