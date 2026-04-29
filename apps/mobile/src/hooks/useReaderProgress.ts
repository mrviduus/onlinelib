import { useCallback, useEffect, MutableRefObject } from 'react'
import { AppState } from 'react-native'
import { readingProgressApi } from '@textstack/shared'
import type { Chapter } from '@textstack/shared'
import { saveLocalProgress } from '../lib/progressStorage'

type Options = {
  editionIdRef: MutableRefObject<string | null>
  chapter: Chapter | null
  chapterSlug: string | undefined
  /** Live cursor for the active chapter slug (changes as user scrolls into next chapter). */
  currentChapterSlugRef: MutableRefObject<string | null>
  /** Live scroll progress (0..1). */
  progressRef: MutableRefObject<number>
  isAuthenticated: boolean
}

/**
 * Owns progress save: a stable `saveProgress()` callback plus the two
 * effects that flush it (unmount cleanup + AppState background/inactive).
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
  isAuthenticated,
}: Options) {
  const saveProgress = useCallback(() => {
    if (!editionIdRef.current || !chapter || !chapterSlug) return
    const slug = currentChapterSlugRef.current || chapterSlug
    const percent = progressRef.current
    const updatedAt = Date.now()

    saveLocalProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      percent,
      updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      progress: percent,
    }).catch(() => {})
  }, [isAuthenticated, chapter, chapterSlug, editionIdRef, currentChapterSlugRef, progressRef])

  useEffect(() => {
    return () => { saveProgress() }
  }, [saveProgress])

  // On Android, Home-button + OS-kill skips useEffect cleanup, so the final
  // scroll position would be lost. AppState fires on home/background;
  // flush now so the next launch resumes at the right place.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') saveProgress()
    })
    return () => sub.remove()
  }, [saveProgress])

  return { saveProgress }
}
