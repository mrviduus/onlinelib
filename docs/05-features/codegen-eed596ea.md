# PDD: Fix User Book Auto-Save Progress Race Condition

## Status
In Progress

## Goal
Fix a bug where user book reading progress is lost on return — user leaves at chapter 3 but returns to chapter 5 (or wrong position). Root cause: scroll save effect fires on mount before scroll position is restored, overwriting saved progress.

## Root Cause Analysis

Commit `90b9a95` removed the `chapterRefs.current.size === 0` guard from the scroll save effect in ReaderPage.tsx. This guard previously prevented the save from firing before the DOM was fully set up. Without it:

1. User opens reader → scroll reader loads chapters (e.g., 3, 4, 5)
2. Scroll save effect fires immediately (because `lastScrollSaveRef.current` is null → `chapterChanged = true`)
3. Saves progress with current viewport position (which may be wrong — offset 0 or browser-restored position)
4. This overwrites the previously saved progress in localStorage AND server
5. Scroll restore effect fires later, but `effectiveProgress` has already been corrupted by the premature save
6. Result: user sees wrong chapter/position on return

## Non-goals
- Rewriting the entire progress tracking system
- Changing the scroll reader architecture
- Fixing public book progress (already works correctly via `useRestoreProgress`)

## Plan

### Slice 1: Guard scroll/pagination saves until position is restored ✅
- [x] Add `scrollRestoredRef` guard to scroll save effect (line ~512) — skip saves until scroll position has been restored
- [x] Add same guard to 30s auto-save interval (line ~589)
- [x] Add `restoredRef` guard to pagination save effects (line ~466, ~620) — skip saves until page position is restored
- [x] Run TypeScript type check to verify no regressions

## Files to Change
- `apps/web/src/pages/ReaderPage.tsx`

## Verification
- `pnpm -C apps/web tsc --noEmit` passes
- Manual test: open user book at chapter 3, close, reopen → should restore to chapter 3
