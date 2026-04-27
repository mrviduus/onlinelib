# Slice 01 — Persistent upload button in header

**Phase:** 1 (Upload UX fix) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.uploadButton`

## Goal

Surface upload as a one-click action from any page on the web app. Today users must click avatar → My Library → Uploads tab → "+" button (4 clicks). Target: 1 click from anywhere.

## Acceptance criteria

1. A visible "+ Upload book" button (or icon-only on small viewports) is rendered in `Header.tsx` between the nav links and the theme toggle, on every page where the header shows.
2. Clicking the button opens a modal `<UploadModal />` that wraps the existing `UploadSection` upload logic — drag-drop, file picker, progress bar, ownership checkbox.
3. The button is **only shown to authenticated users.** Unauthenticated users see a "Sign in to upload" CTA instead (links to login with `?next=/library`).
4. After successful upload the modal closes and navigates to `/:lang/library?tab=uploads&highlight={newBookId}` so the freshly uploaded book is visible and highlighted briefly.
5. Modal is dismissible via Esc, click on backdrop, and explicit X button.
6. Focus trap inside modal while open; focus returns to upload button on close.
7. Keyboard shortcut `Cmd+U` / `Ctrl+U` opens the modal globally (overrides browser "view source" — confirmed acceptable per design call).
8. Behind feature flag `myBooksV2.uploadButton` (default: `true` in dev, `false` in prod for first 48h, then `true`).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/Header.tsx` | Insert `<UploadButton />` between nav links and theme toggle. Auth-gated. |
| `apps/web/src/components/library/UploadButton.tsx` | **New.** Renders the button + opens modal. Reads `useAuth()` for gating. |
| `apps/web/src/components/library/UploadModal.tsx` | **New.** Wraps existing `UploadSection` logic in a portal/modal. Reuses `uploadUserBook()` API call, ownership checkbox, progress UI. |
| `apps/web/src/components/library/UploadSection.tsx` | Refactor: extract upload-form body into a presentational `<UploadForm />` component so both `UploadModal` and `LibraryPage` can render it. Don't break existing layout. |
| `apps/web/src/lib/features.ts` | Add `myBooksV2.uploadButton` flag (default per env). |
| `apps/web/src/lib/telemetry/myBooksV2.ts` | **New.** Emits events: `upload_button.clicked`, `upload_modal.opened`, `upload.completed`, `upload.failed`, with timestamps. |
| `apps/web/src/locales/en.json` | Add keys: `upload.button`, `upload.modal.title`, `upload.modal.signin`, `upload.shortcut.hint`. |
| `apps/web/src/styles/header.css` (or wherever Header styles live) | Style the new button — orange accent matching existing "Continue Reading" CTA. |

## Implementation notes

- Reuse the existing `useUserBookUpload` logic from `UploadSection.tsx` — do NOT reimplement upload state. Extract once, consume twice.
- The modal should mount via React portal to `document.body` to avoid z-index fights with the header's sticky positioning.
- For the Cmd+U shortcut, register a `keydown` listener at the `App.tsx` level inside an effect that depends on auth state. Only active when authenticated. Listener unregisters on logout.
- Button visual: filled orange button on light theme, slightly darker on dark theme, with a "+" icon and "Upload book" label. On viewports < 768px, icon-only with `aria-label`.
- Highlight effect: after redirect to Library, `?highlight={id}` triggers a 2s pulsing border on the matching `UserBookCard`. Implement via a `useHighlightedBook()` hook that reads the query param.

## Out of scope (do NOT do in this slice)

- Drag-drop on whole page → that is slice 02.
- Mobile changes → slice 03.
- Library empty-state changes → slice 04.
- Touching backend or DTOs.

## Tests

**Unit (Vitest):**
- `UploadModal.test.tsx`: opens, closes on Esc, focus trap works, calls upload API on submit.
- `UploadButton.test.tsx`: renders for authenticated user only, navigates to login for unauth.
- `useGlobalUploadShortcut.test.ts`: Cmd+U triggers callback only when auth.

**E2E (Playwright, `apps/web/e2e/tests/upload-flow.spec.ts` — new file):**
- Sign in → click upload button in header → drag a fixture EPUB into modal → wait for processing → assert redirect to `/library?tab=uploads` → assert highlighted card visible.
- Cmd+U opens modal → close with Esc → focus is back on body.
- Unauth user: button hidden / replaced with sign-in CTA.

## Done criterion

```bash
# 1. Tests green
pnpm -C apps/web test --filter Upload
pnpm -C apps/web test:e2e --grep "upload-flow"

# 2. Build green
pnpm -C apps/web build

# 3. Manual smoke (recorded in PR)
# - Click upload button on /en, /en/books, /en/library, /en/profile — modal opens on all
# - Cmd+U works on each page
# - Mobile viewport (< 768px) shows icon-only button with correct aria-label

# 4. No new console errors when navigating across pages with header visible

# 5. Telemetry firing — check Network tab for upload_button.clicked event
```

## Rollback plan

Toggle `myBooksV2.uploadButton` flag to `false` in `apps/web/src/lib/features.ts` and redeploy. Existing upload path via `LibraryPage > Uploads tab > + button` continues to work — never removed in this slice.

## Follow-ups (not blocking)

- After 1 week: review telemetry. If `upload_button.clicked → upload.completed` conversion is < 30%, investigate friction in modal.
- After Phase 1 stable: remove the flag in cleanup slice 99.
