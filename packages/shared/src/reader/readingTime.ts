/**
 * "How much longer?" — time-remaining estimates for the reader.
 *
 * The single most-loved affordance in Kindle is the line that tells you how
 * many minutes are left in the chapter and in the book, adapted to how fast
 * you actually read. Everything needed for it already exists here: chapters
 * carry word counts, and `GET /me/reading/pace` returns a per-user words-per-
 * minute derived from real sessions (with a population fallback when the user
 * has too few).
 *
 * Pure and I/O-free so the arithmetic — which is where an estimate goes
 * embarrassingly wrong — is unit-testable.
 */

import type { ChapterWithCount } from './bookProgress'

/** Used when the server has no per-user pace yet. Deliberately conservative:
 *  this app is read in a second language, where 200+ wpm native prose speeds
 *  do not apply, and an estimate that runs long is kinder than one that runs
 *  short. */
export const FALLBACK_WPM = 150

/** Below this, an estimate is noise — render "less than a minute" instead. */
const SUB_MINUTE = 1

export interface TimeLeft {
  /** Minutes remaining in the current chapter. */
  chapterMinutes: number
  /** Minutes remaining in the whole book, current chapter included. */
  bookMinutes: number
}

/**
 * Words still unread in the current chapter and in the rest of the book.
 *
 * `chapterProgress` is the 0..1 scroll position within the current chapter —
 * the same value the reader already reports.
 */
export function wordsRemaining(
  chapters: ChapterWithCount[],
  currentChapterSlug: string | null | undefined,
  chapterProgress: number,
): { chapter: number; book: number } | null {
  if (!chapters || chapters.length === 0 || !currentChapterSlug) return null
  const idx = chapters.findIndex(c => c.slug === currentChapterSlug)
  if (idx < 0) return null

  const safeProgress = typeof chapterProgress === 'number' && Number.isFinite(chapterProgress)
    ? Math.max(0, Math.min(1, chapterProgress))
    : 0

  const words = (c: ChapterWithCount): number => {
    const w = c.wordCount
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0
  }

  // No chapter carries a word count (some legacy uploads) — there is nothing
  // honest to estimate from, so say so rather than invent a number.
  if (!chapters.some(c => words(c) > 0)) return null

  const current = words(chapters[idx])
  const chapterLeft = current * (1 - safeProgress)

  let after = 0
  for (let i = idx + 1; i < chapters.length; i++) after += words(chapters[i])

  return { chapter: Math.round(chapterLeft), book: Math.round(chapterLeft + after) }
}

/** Minutes for a word count at a given pace. Never negative, always an integer. */
export function minutesForWords(words: number, wpm: number): number {
  if (!Number.isFinite(words) || words <= 0) return 0
  const pace = Number.isFinite(wpm) && wpm > 0 ? wpm : FALLBACK_WPM
  return Math.max(0, Math.round(words / pace))
}

/**
 * Chapter and book estimates in one call. Returns `null` when the book has no
 * word counts to reason about — callers should render nothing, not "0 min".
 */
export function estimateTimeLeft(
  chapters: ChapterWithCount[],
  currentChapterSlug: string | null | undefined,
  chapterProgress: number,
  wpm: number = FALLBACK_WPM,
): TimeLeft | null {
  const remaining = wordsRemaining(chapters, currentChapterSlug, chapterProgress)
  if (!remaining) return null
  return {
    chapterMinutes: minutesForWords(remaining.chapter, wpm),
    bookMinutes: minutesForWords(remaining.book, wpm),
  }
}

/**
 * Display string for a minute count.
 *
 * Rounds to hours past 90 minutes, because "127 min left" reads as precision
 * the estimate does not have. `under` covers the last stretch of a chapter,
 * where "0 min left" would look like a bug.
 */
export function formatMinutesLeft(
  minutes: number,
  labels: { under: string; minutes: string; hours: string; hoursMinutes: string },
): string {
  if (!Number.isFinite(minutes) || minutes < SUB_MINUTE) return labels.under
  if (minutes < 90) return labels.minutes.replace('{minutes}', String(minutes))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return labels.hours.replace('{hours}', String(h))
  return labels.hoursMinutes.replace('{hours}', String(h)).replace('{minutes}', String(m))
}
