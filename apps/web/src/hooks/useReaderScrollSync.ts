import { useCallback, useEffect, useRef } from 'react'
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

  // Reset restore guard on chapter change.
  useEffect(() => {
    scrollRestoredRef.current = false
  }, [chapterIdentifier])

  // Restore scroll: locator must match current chapter, otherwise URL wins.
  useEffect(() => {
    if (scrollRestoredRef.current || effectiveLoading) return
    if (!chapterLoaded) return

    if (!effectiveProgress?.locator?.startsWith('scroll:')) {
      scrollRestoredRef.current = true
      return
    }

    const parts = effectiveProgress.locator.split(':')
    if (parts.length < 3) {
      scrollRestoredRef.current = true
      return
    }

    const savedSlug = parts[1]
    const savedOffset = parseInt(parts[2], 10)
    if (isNaN(savedOffset) || savedSlug !== chapterIdentifier) {
      scrollRestoredRef.current = true
      return
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: savedOffset, behavior: 'instant' })
      scrollRestoredRef.current = true
    })
  }, [chapterLoaded, effectiveLoading, effectiveProgress, chapterIdentifier])

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
