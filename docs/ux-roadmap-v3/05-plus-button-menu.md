# Slice 05 — `+` button becomes a menu

**Phase:** 3 (Add unification + cleanup) · **Estimated:** 1.5 days · **Risk:** low · **Flag:** `myBooksV3.addMenu`

## Goal

Convert the `+` button (added in v2 slice 01 as direct upload modal opener) into a **menu** that lists all current and future ways to add content. Even if today only Upload works, the menu structure prepares future flows (Email-to-Upload, URL paste, Calibre import, RSS-equivalent) without requiring nav rework each time.

Mirrors Readwise's `+` menu (research doc) — single entry point for content addition.

## Acceptance criteria

1. Click `+` in header opens a dropdown menu with:
   - **📁 Upload file** (shortcut: `U`) — opens existing UploadModal (v2 slice 01)
   - **🔗 Paste URL** *(coming soon — disabled with tooltip)*
   - **📧 Email a book** *(coming soon — disabled with tooltip)*
   - ─────
   - **🌐 Browser extension** — opens new tab to extension install page (or Chrome Web Store URL placeholder)
   - **📱 Mobile apps** — link to download page
   - ─────
   - **🔍 Browse all books** — link to `/books`
2. Menu mirrors Readwise pattern: primary actions on top, integrations in middle, discovery at bottom.
3. Cmd+U keyboard shortcut still opens upload modal directly (skips the menu).
4. "Coming soon" items are visually distinct (muted, italic) and show tooltip on hover: "Coming in a future update."
5. Mobile: tapping the center "+" tab opens the same menu as a bottom sheet (modal half-screen). Same options.
6. Menu closes on item click, Esc, or click outside.
7. Behind `myBooksV3.addMenu`. When OFF, `+` button opens upload modal directly (v2 behavior).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/AddMenu.tsx` | **New** — dropdown menu component. |
| `apps/web/src/components/library/UploadButton.tsx` | Refactor — when flag on, renders `<AddMenu>`; when off, current behavior. Mark `// TODO(my-books-v3 cleanup): remove` for the flag branch. |
| `apps/web/src/components/Header.tsx` | Reference `AddMenu` if needed for portal placement. |
| `apps/mobile/src/components/UploadTabButton.tsx` | When tapped, presents `AddMenuBottomSheet` instead of going straight to upload screen. |
| `apps/mobile/src/components/library/AddMenuBottomSheet.tsx` | **New** RN equivalent. |
| `apps/web/src/locales/en.json` + mobile | All menu labels + tooltips for coming-soon items. |
| `infra/env/...` | `VITE_FEATURE_MYBOOKSV3_ADD_MENU=true`. |

## Implementation notes

- **Reuse upload modal** — don't reimplement. Menu item just opens existing `<UploadModal>` from v2.
- **"Coming soon" items** — render as menu items but with `disabled`, lighter text color, and a `<title>` attribute for tooltip. Future slices will swap them to live actions.
- **Menu library:** consider [`@radix-ui/react-dropdown-menu`](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) if you want accessibility for free. Otherwise plain CSS with positioning. Match existing Header dropdown styling.
- **Bottom sheet on mobile:** use `@gorhom/bottom-sheet` or similar. Must support tap-outside-to-dismiss and swipe-down-to-dismiss.
- **Future-proofing:** menu items defined as a `MenuItem[]` array — easy to add Email, URL paste, etc. as their epics ship.

## Out of scope

- Implementing Email-to-Upload (requires backend incoming-mail handler — separate epic).
- Implementing URL paste (requires content fetcher + parser).
- Browser extension itself (already has placeholder install URL).
- Removing v2 UploadButton flag — that happens in cleanup slice 06.

## Tests

**Unit:**
- `AddMenu.test.tsx`: renders all items, "coming soon" items disabled, click on Upload triggers callback, Esc closes.
- `UploadButton.test.tsx` (updated): flag-aware behavior verified.

**E2E:**
- Click `+` → menu opens → click Upload → upload modal opens.
- Click `+` → press Esc → menu closes.
- Hover "Paste URL" → tooltip "Coming in a future update" visible.
- Mobile: tap `+` tab → bottom sheet appears with same options.

## Done criterion

```bash
pnpm -C apps/web test --filter "AddMenu|UploadButton"
pnpm -C apps/web test:e2e --grep "add-menu"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_ADD_MENU=false`. `+` button reverts to direct upload modal. Cmd+U still works. No data changes.

## Follow-ups

- Email-to-Upload epic (backend infra + UI activation of menu item).
- URL-paste epic (content fetcher + UI activation).
- Calibre/Kindle-export import flow.
- "Recent uploads" mini-list above menu items.
