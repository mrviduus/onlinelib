# PDD: Fix Vocabulary Word Re-Selection in Reader

## Status
Completed

## Goal
Fix a bug where re-selecting a word already saved to vocabulary doesn't show the DictionaryCard popup. Users expect to see the dictionary popup with an option to remove the word from their vocabulary.

## Root Cause
When a word is auto-saved to vocabulary, `addVocabWord` updates `vocabMap` (new Map reference). This triggers `VocabWordLayer`'s effect, which removes all `<mark>` elements and re-creates them after 150ms. This DOM mutation collapses or invalidates the browser's active text selection, causing `hasSelection` to flip to `false` and the DictionaryCard to disappear. On re-selection, the same cycle repeats — the word gets "re-saved" (backend returns existing), vocabMap ref changes, VocabWordLayer re-marks, and the selection is destroyed again.

## Non-goals
- Changing the SRS logic
- Redesigning the full DictionaryCard/Popup UI
- Adding new vocabulary features beyond "remove word"

## Plan

### Slice 1: Prevent VocabWordLayer from destroying active selection ✅
- [x] In `useReaderVocabulary.ts`: Don't create a new Map ref in `addWord` if the word already exists with the same stage (skip no-op updates)
- [x] In `ReaderHighlights.tsx`: For already-saved words, skip the auto-save call entirely and immediately show `autoSaveState = 'saved'`
- [x] Add `removeWord` callback to `useReaderVocabulary` hook
- [x] Pass `onRemoveWord` to `DictionaryCard` and show a remove button for already-saved words
- [x] Add CSS styles for remove button

### Slice 2: Add "Remove from vocabulary" to DictionaryPopup (expanded view) ✅
- [x] Add `onRemoveWord` prop to `DictionaryPopup`
- [x] Show remove button when word is already in vocabulary
- [x] Wire up in `ReaderHighlights.tsx`
- [x] Clean up dictionary popup state on word removal

## Files to Change
- `apps/web/src/hooks/useReaderVocabulary.ts` — add `removeWord`, skip no-op in `addWord`
- `apps/web/src/components/reader/ReaderHighlights.tsx` — skip auto-save for existing words, wire remove
- `apps/web/src/components/reader/DictionaryCard.tsx` — add remove button
- `apps/web/src/components/reader/DictionaryPopup.tsx` — add remove button (Slice 2)

## Verification
- `pnpm -C apps/web tsc --noEmit` — type check passes
- Manual: select word → card appears → clear → re-select same word → card appears again
- Manual: select saved word → click remove → word removed from vocabulary
