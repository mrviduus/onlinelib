# Slice 04 — Library empty state = drop-zone

**Phase:** 1 (Upload UX fix) · **Estimated:** 0.5 day · **Risk:** very low · **Flag:** none (pure UI)

## Goal

Replace the current passive empty state ("No uploaded books yet. Click the + button to upload") with an active, large drop-zone CTA. Empty state is a teaching moment — currently it tells, should show.

Same change applies to web AND mobile Library Uploads tab.

## Acceptance criteria

1. **Web:** when user has 0 uploaded books AND is on Uploads tab (or on the unified library if Phase 3 collapses tabs), the page renders a large dashed drop-zone covering ~50% viewport height with:
   - Icon (cloud-upload, larger than current cloud emoji)
   - Headline "Drop your first book here"
   - Subtext "EPUB, PDF, or FB2 — up to {quota} of free storage"
   - "Or browse files" button (opens file picker)
   - Subtle hint "or press ⌘U from anywhere"
2. **Mobile:** same idea adapted to touch — large tappable card with same icon + headline + "Tap to choose a file" button. No drag-drop hint (no concept on mobile).
3. Drop-zone responds to drag-over with visual feedback (border becomes solid, background tints).
4. Dropping a file directly onto this zone uploads it the same way as the global drop-zone (slice 02).
5. After first upload completes, this empty state is replaced by the normal book grid — no lingering CTA banner.
6. Storage quota text reads dynamically from `getStorageQuota()` (exists in `UploadSection`).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/EmptyState.tsx` | Rewrite Uploads-tab empty state. Saved-tab empty state stays untouched (different message). |
| `apps/web/src/components/library/UploadDropZone.tsx` | **New.** Reusable presentational component. Used by `EmptyState` AND can be used elsewhere. |
| `apps/web/src/styles/library.css` (or wherever Library styles live) | New rules for the larger dropzone. |
| `apps/mobile/app/(tabs)/library.tsx` | Replace empty-state component for uploads tab. |
| `apps/mobile/src/components/library/UploadEmptyCard.tsx` | **New.** Mobile-friendly equivalent. |
| `apps/web/src/locales/en.json` and `apps/mobile/src/locales/en.json` | Add `library.empty.uploads.title`, `library.empty.uploads.subtitle`, `library.empty.uploads.cta`, `library.empty.uploads.shortcut`. |

## Implementation notes

- **Reuse drag handlers from slice 02** (`useDragFileTracker`) instead of adding local listeners. The component just needs to render highlighted state when global `isDragging` is true.
- **Quota display:** call `getStorageQuota()` once on mount, show as "0 B of 100 MB used" or "Free up to 100 MB". If quota call fails, fall back to plain "EPUB, PDF, or FB2" without quota.
- **Don't show shortcut hint on mobile.** Hide based on `useIsMobile()` hook (already exists).
- **Visual:** dashed 2px border in muted color, 64px tall icon, headline ~32px, generous padding (96px vertical). Should feel like the page is asking for a book, not waiting for one.

## Out of scope

- Saved-tab empty state — different intent (browse catalog), don't bundle.
- New users without ANY books at all (uploaded OR saved) — that's a homepage problem, separate from Library page.
- Mobile FAB → covered in slice 03.

## Tests

**Unit:**
- `EmptyState.test.tsx`: renders correct empty state per active tab.
- `UploadDropZone.test.tsx`: shows hover state on `isDragging=true`, calls `onFileSelected` from picker.

**E2E:**
- Fresh user → navigate to `/library?tab=uploads` → assert large dropzone visible with correct quota.
- Upload a file → assert dropzone disappears, replaced by book card.
- Mobile: launch fresh user → Library tab → Uploads sub-tab → assert tappable empty card → tap → file picker opens.

## Done criterion

```bash
pnpm -C apps/web test --filter "EmptyState|UploadDropZone"
pnpm -C apps/web test:e2e --grep "empty-state"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit

# Manual
# - Fresh account on web → /library?tab=uploads → large dropzone present
# - Drag .epub from Finder onto the zone → border solid → drop → upload starts
# - After upload completes → dropzone replaced by book card
# - Repeat on mobile sim
```

## Rollback plan

Revert single PR — no flag needed since this is a pure presentational improvement and the logic underneath (`uploadUserBook`, file picker) is unchanged.

## Follow-ups

- Consider showing a 30s onboarding screencast embedded inline ("Watch how to upload") — Phase 4 polish.
- A/B test "Drop your first book here" vs "Start your library" copy — out of scope, just track metric.
