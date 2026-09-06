/**
 * Which review mode a session starts in.
 *
 * **The bug this exists to make impossible (#558).** `app/vocabulary/review.tsx`
 * had two mount effects: one dispatched `setReviewMode(params.reviewMode)`, the
 * next called `startSession(batch, review.reviewMode, …)` — and that
 * `review.reviewMode` is the mount-render closure value, i.e. still the hook
 * default `'classic'`. `startSession` then dispatches it too. Both dispatches
 * land in one batch and the later one wins, so `?reviewMode=blitz` produced a
 * Flashcards session 100% of the time. Not a race: the losing order was fixed.
 *
 * The rule, borrowed verbatim from web (`apps/web/src/pages/VocabularyReviewPage.tsx`):
 * derive the starting mode from the params as a plain value and hand THAT to
 * `startSession`. Never read hook state during startup. One writer, no batch to
 * lose.
 *
 * Pure (`reviewModeFromParam`) plus two AsyncStorage helpers, because mobile's
 * `vitest.config.ts` only collects `src/lib/**` — a rule that lives in a screen
 * is a rule that cannot be tested, which is how the above shipped.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReviewMode } from '@textstack/shared'

/** What a session runs when nothing says otherwise. Matches `useVocabularyReview`. */
export const DEFAULT_REVIEW_MODE: ReviewMode = 'classic'

export function isReviewMode(value: unknown): value is ReviewMode {
  return value === 'blitz' || value === 'classic'
}

/**
 * Route param → mode. Total: anything unrecognised (missing, garbage, wrong
 * case, or the `string[]` expo-router hands back for a repeated param) falls to
 * the default rather than throwing at a reader who tapped Practice.
 *
 * Deliberately case-sensitive. `?reviewMode=Blitz` is a caller bug, and
 * silently repairing it hides the caller; the app itself only ever emits the
 * lowercase literals.
 */
export function reviewModeFromParam(raw: unknown): ReviewMode {
  return isReviewMode(raw) ? raw : DEFAULT_REVIEW_MODE
}

/**
 * Where the chosen mode survives a cold start.
 *
 * `app/(tabs)/vocabulary.tsx` held the choice in `useState`, so "it persists"
 * only meant "the tab stayed mounted" — killing the app silently reverted to
 * Flashcards. Web has always persisted it (`localStorage['practiceMode']`,
 * `apps/web/src/pages/VocabularyPage.tsx`); this is the same setting, keyed for
 * AsyncStorage.
 */
const STORAGE_KEY = 'vocab.reviewMode.v1'

export async function loadReviewMode(): Promise<ReviewMode> {
  try {
    return reviewModeFromParam(await AsyncStorage.getItem(STORAGE_KEY))
  } catch {
    // Storage unavailable is not worth a broken screen — a setting reverting to
    // its default is the mildest possible failure.
    return DEFAULT_REVIEW_MODE
  }
}

export async function saveReviewMode(mode: ReviewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Fire-and-forget: the in-memory state is already correct for this session.
  }
}
