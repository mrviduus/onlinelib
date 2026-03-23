# PDD: Fix Reader Auto-Save & Scroll Progress Skip Moments

## Status
In Progress

## Goal
Fix issues where reading progress is silently skipped and not saved in the reader, ensuring users never lose their reading position when navigating away or closing the app.

## Non-goals
- Change the overall progress calculation algorithm
- Add new user-facing features
- Modify the server-side progress API

## Analysis

### Issues Identified

**Issue 1: Scroll mode cleanup doesn't flush pending save (Critical)**
- Location: `ReaderPage.tsx:517-521`
- Problem: When user navigates away during the 600ms debounce window, the scroll save timer is cleared but the pending progress is never saved
- Impact: Users lose scroll position on navigation/tab close

**Issue 2: 500px threshold may skip small reading progress**
- Location: `ReaderPage.tsx:486`
- Problem: Progress is only saved when scroll offset changes by 500px+ within same chapter
- Impact: Short reading sessions (<500px scroll) may not save position
- Note: This is a deliberate tradeoff for performance; may be acceptable

**Issue 3: No visibility/unload handlers for scroll mode save**
- Location: `ReaderPage.tsx:474-514` (scroll save effect)
- Problem: The `useReadingProgress` hook has visibility/unload handlers, but the scroll mode bypasses `publicProgress.updateProgress` during the debounce
- Impact: `flushSave()` only flushes what's in `pendingSyncRef`, not the `scrollSaveTimerRef` pending update

## Plan

### Slice 1: Add flush logic for scroll mode pending save (PRIORITY) ✅ DONE
- Add visibility change and beforeunload handlers specifically for scroll mode
- Execute pending scroll save immediately when leaving page
- Ensure `scrollSaveTimerRef` pending values are saved, not just cleared

Files:
- `apps/web/src/pages/ReaderPage.tsx`

**Implementation:**
- Added `pendingScrollSaveRef` to store save data during debounce
- Created `flushScrollSave()` callback to immediately execute pending saves
- Added `visibilitychange`/`beforeunload` handlers for scroll mode
- Flush happens on unmount as well
- Commit: `fix: reader scroll mode — flush pending save on visibility/unload`

### Slice 2: Consider lowering the 500px threshold or adding time-based trigger
- Add time-based auto-save (e.g., every 30s if position changed at all)
- OR lower threshold from 500px to 200px
- Evaluate performance impact

Files:
- `apps/web/src/pages/ReaderPage.tsx`

### Slice 3: Add unit tests for save edge cases
- Test that flush happens on visibility hidden
- Test that flush happens on beforeunload
- Test that debounced save works correctly

Files:
- `apps/web/src/pages/__tests__/ReaderPage.test.tsx` (if exists)
- `apps/web/e2e/tests/reader-progress.spec.ts` (new or existing)

## Verification
1. Run type check: `pnpm -C apps/web tsc --noEmit`
2. Manual test:
   - Open reader in scroll mode (mobile or resize window)
   - Scroll down ~100px
   - Close tab immediately
   - Reopen same book - should restore exact position
3. E2E test if available: `pnpm -C apps/web test:e2e --grep "progress"`

## Files to Change
- `apps/web/src/pages/ReaderPage.tsx` - Add scroll mode flush handlers
