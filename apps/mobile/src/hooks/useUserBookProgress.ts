import { useCallback, useEffect, useRef, MutableRefObject } from 'react'
import { userBooksApi, buildUserBookProgressPayload } from '@textstack/shared'
import { saveUserBookLocalProgress } from '../lib/progressStorage'
import { useFlushOnBackground } from './useFlushOnBackground'

type Options = {
  /** User-uploaded book id (route param). null disables saves. */
  bookId: string | null
  /** Active chapter slug — falls back to URL chapterSlug when the WebView
   *  hasn't reported its current slug yet (early ticks before 'progress'
   *  message lands). */
  chapterSlug: string | undefined
  /** Live cursor for the active chapter slug (advances during infinite scroll). */
  currentChapterSlugRef: MutableRefObject<string | null>
  /** Live scroll progress (0..1) within the active chapter. */
  progressRef: MutableRefObject<number>
  /** Live scrollY pixel offset for the resume locator. */
  scrollOffsetRef: MutableRefObject<number>
  /** Live book-wide percent (0..1, null until chapters resolve). Saved
   *  locally so ContinueReadingCard can render book-progress for user
   *  books — the server only stores chapter-level percent. */
  bookProgressRef: MutableRefObject<number | null>
}

/**
 * Progress save for user-uploaded books. Mirrors the catalog-reader
 * `useReaderProgress` hook contract:
 *   - `saveProgress()` — flush immediately (unmount, AppState background)
 *   - `bumpProgress()` — schedule a 2s-debounced save while reading
 *
 * Differences from catalog flow:
 *   - Server PUT goes to `/me/books/{id}/progress` (no editionId/chapterId)
 *   - Book-percent is cached locally only (no server field for it yet —
 *     see ADR in plan file)
 *   - No offline-first store for resume position; user-book reader reads
 *     server progress on chapter mount (single source of truth)
 *
 * AppState background flush is critical for Android, which skips useEffect
 * cleanup on OS-kill — without it, the last ~2 seconds of scroll always
 * vanish on app death.
 */
export function useUserBookProgress({
  bookId,
  chapterSlug,
  currentChapterSlugRef,
  progressRef,
  scrollOffsetRef,
  bookProgressRef,
}: Options) {
  const saveProgress = useCallback(() => {
    if (!bookId) return
    // Pure payload builder lives in @textstack/shared — see its tests
    // for clamping / null behavior. Hook now contains only orchestration.
    const payload = buildUserBookProgressPayload({
      currentChapterSlug: currentChapterSlugRef.current,
      fallbackChapterSlug: chapterSlug,
      chapterProgress: progressRef.current,
      scrollOffset: scrollOffsetRef.current,
    })
    if (!payload) return

    userBooksApi.updateUserBookProgress(bookId, payload)
      .catch(e => { if (__DEV__) console.warn('[user-book-progress] PUT failed:', e) })

    const bp = bookProgressRef.current
    if (typeof bp === 'number') {
      // Local cache for home ContinueReadingCard. Fire-and-forget — if the
      // device is out of storage the next save will retry.
      saveUserBookLocalProgress(bookId, { bookPercent: bp, updatedAt: Date.now() })
        .catch(() => {})
    }
  }, [bookId, chapterSlug, currentChapterSlugRef, progressRef, scrollOffsetRef, bookProgressRef])

  // 2s-debounced save — matches catalog reader cadence. Short enough that
  // a force-kill mid-chapter never loses more than the last couple seconds
  // of scrolling, long enough that fast scrubbing doesn't spam PUTs.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bumpProgress = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      saveProgress()
    }, 2000)
  }, [saveProgress])

  // Flush on unmount — covers chapter navigation + tab-away in single tap.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      saveProgress()
    }
  }, [saveProgress])

  // Android OS-kill skips React cleanup; AppState background fires before
  // the kill so we get one last sync write of scroll + book-percent cache.
  useFlushOnBackground(saveProgress)

  return { saveProgress, bumpProgress }
}
