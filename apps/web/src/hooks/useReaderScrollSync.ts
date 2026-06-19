import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookDetail } from '../types/api'
import type { ReaderMode } from './useReaderChapter'

interface ProgressLocator {
  locator?: string | null
}

interface PublicProgressApi {
  updateProgress: (
    percent: number,
    page?: number,
    scrollLocator?: string,
    overrideChapterId?: string,
    overrideChapterSlug?: string,
  ) => void
  flushSave: () => void
}

interface UserProgressApi {
  saveProgress: (chapterSlug: string, page: number, percent: number, locator?: string) => Promise<void> | void
  flushSave: () => void
}

interface Params {
  mode: ReaderMode
  chapterIdentifier: string | undefined
  chapterLoaded: boolean
  overallProgress: number
  effectiveProgress: ProgressLocator | null
  effectiveLoading: boolean
  publicBookChapters: BookDetail['chapters'] | undefined
  publicProgress: PublicProgressApi
  userProgress: UserProgressApi
}

const SAVE_DEBOUNCE_MS = 600
const SAVE_SKIP_WINDOW_MS = 2000

export function useReaderScrollSync({
  mode,
  chapterIdentifier,
  chapterLoaded,
  overallProgress,
  effectiveProgress,
  effectiveLoading,
  publicBookChapters,
  publicProgress,
  userProgress,
}: Params) {
  const scrollRestoredRef = useRef(false)
  const lastSaveRef = useRef<{ identifier: string; offset: number; timestamp: number } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<{ identifier: string; offset: number; progress: number } | null>(null)
  // State-backed mirror of scrollRestoredRef so the save-on-open effect can
  // re-run AFTER restore completes (a ref flip won't trigger a re-render).
  // Keyed by the chapter identifier that was restored.
  const [restoredFor, setRestoredFor] = useState<string | null>(null)
  // Guard: emit exactly one save-on-open per opened chapter.
  const savedOnOpenForRef = useRef<string | null>(null)

  // Reset restore guard on chapter change.
  useEffect(() => {
    scrollRestoredRef.current = false
    setRestoredFor(null)
  }, [chapterIdentifier])

  // Restore scroll: locator must match current chapter. Otherwise scroll to
  // top — React Router preserves scrollY across route changes, so without
  // this, hitting "Next" at the bottom of ch1 leaves you mid-/end-of ch2.
  useEffect(() => {
    if (scrollRestoredRef.current || effectiveLoading) return
    if (!chapterLoaded) return

    const targetOffset = (() => {
      if (!effectiveProgress?.locator?.startsWith('scroll:')) return 0
      const parts = effectiveProgress.locator.split(':')
      if (parts.length < 3) return 0
      const savedSlug = parts[1]
      const savedOffset = parseInt(parts[2], 10)
      if (isNaN(savedOffset) || savedSlug !== chapterIdentifier) return 0
      return savedOffset
    })()

    requestAnimationFrame(() => {
      window.scrollTo({ top: targetOffset, behavior: 'instant' })
      scrollRestoredRef.current = true
      setRestoredFor(chapterIdentifier ?? null)
    })
  }, [chapterLoaded, effectiveLoading, effectiveProgress, chapterIdentifier])

  // Save-on-chapter-open: the debounced scroll save is gated by user scrolling,
  // so chapter→chapter navigation (route param change; ReaderPage stays mounted)
  // recorded NOTHING for the new chapter — MaxChapterNumber stayed unset and the
  // book indicator showed "0 / N". Fire exactly ONE save when a chapter opens,
  // sequenced AFTER restore so the offset reflects the restored scroll, not a
  // transient 0. Uses the current chapter's id + book-level overallProgress.
  useEffect(() => {
    if (!chapterLoaded || !chapterIdentifier) return
    // Wait until restore has run for THIS chapter (offset is settled).
    if (restoredFor !== chapterIdentifier) return
    if (savedOnOpenForRef.current === chapterIdentifier) return
    savedOnOpenForRef.current = chapterIdentifier

    const offset = (document.scrollingElement || document.documentElement).scrollTop
    const scrollLocator = `scroll:${chapterIdentifier}:${Math.round(offset)}`

    // Prime the dedupe/skip refs so the next scroll-debounced save doesn't
    // immediately re-fire an identical write for the same chapter.
    lastSaveRef.current = { identifier: chapterIdentifier, offset, timestamp: Date.now() }
    pendingSaveRef.current = { identifier: chapterIdentifier, offset, progress: overallProgress }

    if (mode === 'public' && publicBookChapters) {
      const bookChapter = publicBookChapters.find(c => c.slug === chapterIdentifier)
      if (bookChapter) {
        publicProgress.updateProgress(overallProgress, undefined, scrollLocator, bookChapter.id, chapterIdentifier)
      }
    } else if (mode === 'userbook') {
      userProgress.saveProgress(chapterIdentifier, 0, overallProgress, scrollLocator)
    }
    // overallProgress intentionally excluded: we snapshot it on open only. The
    // scroll-debounced effect owns continuous updates as the user reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdentifier, chapterLoaded, mode, restoredFor, publicBookChapters, publicProgress, userProgress])

  // Flush pending save now: write locally + ask the underlying hook to ship
  // synchronously (keepalive fetch) so we don't lose the write on tab death.
  const flushSave = useCallback(() => {
    const pending = pendingSaveRef.current
    if (!pending) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const { identifier, offset, progress } = pending
    const scrollLocator = `scroll:${identifier}:${Math.round(offset)}`

    if (mode === 'public' && publicBookChapters) {
      const bookChapter = publicBookChapters.find(c => c.slug === identifier)
      if (bookChapter) {
        publicProgress.updateProgress(progress, undefined, scrollLocator, bookChapter.id, identifier)
        publicProgress.flushSave()
      }
    } else if (mode === 'userbook') {
      userProgress.saveProgress(identifier, 0, progress, scrollLocator)
      userProgress.flushSave()
    }

    pendingSaveRef.current = null
  }, [mode, publicBookChapters, publicProgress, userProgress])

  // Debounced save on scroll position change. The save effect keys off
  // overallProgress so it re-runs when chapter scroll moves.
  useEffect(() => {
    if (!scrollRestoredRef.current) return
    const visibleId = chapterIdentifier
    if (!visibleId) return

    const offset = (document.scrollingElement || document.documentElement).scrollTop
    const now = Date.now()
    const last = lastSaveRef.current
    const chapterChanged = !last || last.identifier !== visibleId
    if (!chapterChanged && last && (now - last.timestamp) < SAVE_SKIP_WINDOW_MS) return

    lastSaveRef.current = { identifier: visibleId, offset, timestamp: now }
    pendingSaveRef.current = { identifier: visibleId, offset, progress: overallProgress }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const saveId = visibleId
    const saveOffset = offset
    const saveProgress = overallProgress

    saveTimerRef.current = window.setTimeout(() => {
      const scrollLocator = `scroll:${saveId}:${Math.round(saveOffset)}`
      if (mode === 'public' && publicBookChapters) {
        const bookChapter = publicBookChapters.find(c => c.slug === saveId)
        if (bookChapter) {
          publicProgress.updateProgress(saveProgress, undefined, scrollLocator, bookChapter.id, saveId)
        }
      } else if (mode === 'userbook') {
        userProgress.saveProgress(saveId, 0, saveProgress, scrollLocator)
      }
      pendingSaveRef.current = null
      saveTimerRef.current = null
    }, SAVE_DEBOUNCE_MS)
  }, [mode, publicBookChapters, chapterIdentifier, overallProgress, publicProgress, userProgress])

  // Flush on visibility hidden / beforeunload / unmount.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushSave()
    }
    const onBeforeUnload = () => flushSave()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      flushSave()
    }
  }, [flushSave])
}
