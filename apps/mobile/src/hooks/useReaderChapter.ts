import { useEffect, useRef, useState, MutableRefObject } from 'react'
import { createBooksApi } from '@textstack/shared'
import type { Chapter, Language } from '@textstack/shared'
import { getCachedChapter, getAllCachedBooks } from '../lib/offlineDb'

type Options = {
  bookSlug: string | undefined
  chapterSlug: string | undefined
  language: Language
  /** Resolved edition id for the current book (set by the book-meta effect in the screen). */
  editionIdRef: MutableRefObject<string | null>
}

/**
 * Owns the chapter fetch: network-first with cancellation, then SQLite
 * cache fallback so an offline-downloaded chapter still renders. Surfaces
 * `chapterError` so the screen can swap the eternal spinner for a real
 * empty-state on offline-miss / 404 (R-4).
 *
 * `wordCountRef` is exposed as a ref because `loadNextChapter` in the
 * screen accumulates next-chapter word counts into it (infinite scroll).
 */
export function useReaderChapter({ bookSlug, chapterSlug, language, editionIdRef }: Options) {
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterError, setChapterError] = useState<'offline' | 'notfound' | null>(null)
  const wordCountRef = useRef(0)

  // Chapter fetch — network first, then SQLite cache. Adds cancellation so
  // rapid chapter navigation can't let a stale response stomp the current
  // chapter (R-4) and updates the offline-miss path to surface a real
  // empty-state rather than leaving the user on a permanent spinner.
  useEffect(() => {
    if (!bookSlug || !chapterSlug) return
    let cancelled = false
    setLoading(true)
    setChapterError(null)

    ;(async () => {
      let onlineError: unknown = null
      try {
        const api = createBooksApi(language)
        const ch = await api.getChapter(bookSlug, chapterSlug)
        if (cancelled) return
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
        setLoading(false)
        return
      } catch (err) {
        onlineError = err
      }

      // Online fetch failed — try the offline cache. Prefer the
      // already-resolved editionId from the book effect; fall back to
      // iterating cached books so a cold start (no book meta yet) still
      // works.
      try {
        let editionId = editionIdRef.current
        if (!editionId) {
          const books = await getAllCachedBooks()
          if (cancelled) return
          editionId = books.find(b => b.slug === bookSlug)?.editionId ?? null
        }
        if (editionId) {
          const cached = await getCachedChapter(editionId, chapterSlug)
          if (cancelled) return
          if (cached) {
            setChapter({
              id: '',
              chapterNumber: 0,
              slug: cached.chapterSlug,
              title: cached.title,
              html: cached.html,
              wordCount: cached.wordCount,
              prev: cached.prev,
              next: cached.next,
            })
            wordCountRef.current = cached.wordCount || 0
            setLoading(false)
            return
          }
        }
      } catch (e) {
        if (!cancelled) console.warn('Offline cache read failed:', e)
      }

      // No online response AND no cached copy — show a proper empty state.
      if (cancelled) return
      const status = (onlineError as { status?: number } | null)?.status
      setChapter(null)
      setChapterError(status === 404 ? 'notfound' : 'offline')
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [bookSlug, chapterSlug, language, editionIdRef])

  return { chapter, setChapter, loading, chapterError, wordCountRef }
}
