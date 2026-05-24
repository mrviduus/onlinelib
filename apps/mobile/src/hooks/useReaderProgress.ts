import { useCallback, useEffect, useRef, MutableRefObject } from 'react'
import { readingProgressApi } from '@textstack/shared'
import type { Chapter } from '@textstack/shared'
import { saveLocalProgress } from '../lib/progressStorage'
import { useFlushOnBackground } from './useFlushOnBackground'

type Options = {
  editionIdRef: MutableRefObject<string | null>
  chapter: Chapter | null
  chapterSlug: string | undefined
  /** Live cursor for the active chapter slug (changes as user scrolls into next chapter). */
  currentChapterSlugRef: MutableRefObject<string | null>
  /** Live scroll progress (0..1). */
  progressRef: MutableRefObject<number>
  /** Live scrollY pixel offset reported by the WebView. Used to build a
   *  `scroll:${slug}:${offset}` locator so resume is pixel-accurate, not
   *  just percent-accurate (which is too coarse for long chapters). */
  scrollOffsetRef: MutableRefObject<number>
  /** Live book-wide percent (0..1). Persisted into LocalProgress so home
   *  ContinueReadingCard can show book progress, not chapter progress.
   *  Nullable while chapters/wordCount haven't resolved yet. */
  bookPercentRef?: MutableRefObject<number | null>
  isAuthenticated: boolean
}

/**
 * Owns progress save:
 * - `saveProgress()` — synchronous flush for unmount / AppState background.
 * - `bumpProgress()` — schedules a 2s-debounced save while reading.
 *   Mirrors apps/web/src/hooks/useReadingProgress.ts:84-101.
 *
 * Offline-first: always persists locally, even for guests. LWW via `updatedAt`.
 * Authenticated users also PUT to the server (fire-and-forget).
 */
export function useReaderProgress({
  editionIdRef,
  chapter,
  chapterSlug,
  currentChapterSlugRef,
  progressRef,
  scrollOffsetRef,
  bookPercentRef,
  isAuthenticated,
}: Options) {
  const saveProgress = useCallback(() => {
    if (!editionIdRef.current || !chapter || !chapterSlug) return
    const slug = currentChapterSlugRef.current || chapterSlug
    const percent = progressRef.current
    const offset = scrollOffsetRef.current
    const locator = `scroll:${slug}:${offset}`
    const updatedAt = Date.now()

    saveLocalProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      locator,
      percent,
      // Only persist a numeric book percent — null leaves the prior value
      // in place (the resume card would otherwise lose its book-progress
      // hint between the WebView mounting and chapters arriving).
      bookPercent: bookPercentRef?.current ?? undefined,
      updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      progress: percent,
    }).catch(() => {})
  }, [isAuthenticated, chapter, chapterSlug, editionIdRef, currentChapterSlugRef, progressRef, scrollOffsetRef, bookPercentRef])

  // 2s debounced save fired on every reportProgress() bump from the WebView.
  // PWA uses the same cadence (useReadingProgress.ts:84-101) — short enough
  // that a force-kill in the middle of a chapter never loses more than the
  // last couple seconds of scrolling, long enough that fast scrubbing
  // doesn't spam PUTs.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bumpProgress = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      saveProgress()
    }, 2000)
  }, [saveProgress])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      saveProgress()
    }
  }, [saveProgress])

  // Android OS-kill skips useEffect cleanup; AppState background fires
  // before the kill so we get one last sync write of scroll position.
  useFlushOnBackground(saveProgress)

  return { saveProgress, bumpProgress }
}
