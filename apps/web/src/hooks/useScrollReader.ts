import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'

export interface LoadedChapter {
  identifier: string // slug for both public and userbook
  title: string
  html: string
  wordCount: number | null
  index: number // position in book.chapters
}

interface ChapterSummary {
  identifier: string
  title: string
  chapterNumber: number
  wordCount?: number | null
}

interface FetchedChapter {
  identifier: string
  title: string
  html: string
  wordCount: number | null
}

interface UseScrollReaderProps {
  book: { chapters: ChapterSummary[] } | null
  initialIdentifier: string
  bookId: string // editionId for public, userBookId for userbook
  fetchChapter: (identifier: string) => Promise<FetchedChapter>
}

interface UseScrollReaderResult {
  chapters: LoadedChapter[]
  visibleIdentifier: string
  isLoadingMore: boolean
  loadError: string | null
  scrollOffset: number
  isAtEnd: boolean
  loadMore: () => Promise<void>
  loadPrev: () => Promise<void>
  scrollToChapter: (identifier: string) => void
  chapterRefs: React.MutableRefObject<Map<string, HTMLElement>>
}

const CHAPTERS_BUFFER = 2 // Load 2 chapters ahead/behind
// Keep this many chapters on each side of visible; evict beyond.
// Window = BUFFER+1 (3) → max ~7 kept; tight enough to actually kick in on
// mid-length books (13-ch Alice) while preserving the prefetch frontier.
const CHAPTERS_EVICT_WINDOW = CHAPTERS_BUFFER + 1

export function useScrollReader({
  book,
  initialIdentifier,
  bookId: _bookId,
  fetchChapter,
}: UseScrollReaderProps): UseScrollReaderResult {
  const [chapters, setChapters] = useState<LoadedChapter[]>([])
  const [visibleIdentifier, setVisibleIdentifier] = useState(initialIdentifier)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scrollOffset, setScrollOffset] = useState(0)

  const chapterRefs = useRef<Map<string, HTMLElement>>(new Map())
  const loadingRef = useRef(false)
  const loadedIdsRef = useRef<Set<string>>(new Set())
  const lastInitialIdRef = useRef(initialIdentifier)
  const evictAnchorRef = useRef<{ id: string; top: number } | null>(null)

  // Reset when navigating to a different chapter.
  // Back-button preserves session: if target chapter is already loaded, just
  // scroll to it instead of wiping state (B11).
  useEffect(() => {
    if (lastInitialIdRef.current === initialIdentifier) return
    lastInitialIdRef.current = initialIdentifier

    if (loadedIdsRef.current.has(initialIdentifier)) {
      const el = chapterRefs.current.get(initialIdentifier)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setVisibleIdentifier(initialIdentifier)
        return
      }
    }

    setChapters([])
    setVisibleIdentifier(initialIdentifier)
    setScrollOffset(0)
    loadedIdsRef.current.clear()
    chapterRefs.current.clear()
  }, [initialIdentifier])

  // Get chapter index from book
  const getChapterIndex = useCallback(
    (identifier: string): number => {
      if (!book) return -1
      return book.chapters.findIndex((c) => c.identifier === identifier)
    },
    [book]
  )

  // Fetch a single chapter
  const loadChapter = useCallback(
    async (chapterSummary: ChapterSummary): Promise<LoadedChapter | null> => {
      const { identifier } = chapterSummary

      // Skip if already loaded
      if (loadedIdsRef.current.has(identifier)) return null

      try {
        const chapterData = await fetchChapter(identifier)

        const index = book?.chapters.findIndex((c) => c.identifier === identifier) ?? -1
        loadedIdsRef.current.add(identifier)

        return {
          identifier: chapterData.identifier,
          title: chapterData.title,
          html: chapterData.html,
          wordCount: chapterData.wordCount,
          index,
        }
      } catch (err) {
        console.error(`Failed to load chapter ${identifier}:`, err)
        return null
      }
    },
    [fetchChapter, book]
  )

  // Initial load: current chapter + next CHAPTERS_BUFFER
  useEffect(() => {
    if (!book || chapters.length > 0) return

    const loadInitial = async () => {
      setIsLoadingMore(true)
      setLoadError(null)

      try {
        const currentIndex = getChapterIndex(initialIdentifier)
        if (currentIndex === -1) {
          setLoadError('Chapter not found')
          return
        }

        // Load current + next chapters
        const toLoad = book.chapters.slice(currentIndex, currentIndex + CHAPTERS_BUFFER + 1)
        const loaded: LoadedChapter[] = []

        for (const summary of toLoad) {
          const chapter = await loadChapter(summary)
          if (chapter) loaded.push(chapter)
        }

        // Sort by index to ensure correct order
        loaded.sort((a, b) => a.index - b.index)
        setChapters(loaded)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load chapters')
      } finally {
        setIsLoadingMore(false)
      }
    }

    loadInitial()
  }, [book, initialIdentifier, getChapterIndex, loadChapter, chapters.length])

  // Load more chapters (next)
  const loadMore = useCallback(async () => {
    if (!book || loadingRef.current || isLoadingMore) return
    loadingRef.current = true
    setIsLoadingMore(true)

    try {
      // Find the last loaded chapter's index
      const lastLoaded = chapters[chapters.length - 1]
      if (!lastLoaded) return

      const nextIndex = lastLoaded.index + 1
      const toLoad = book.chapters.slice(nextIndex, nextIndex + CHAPTERS_BUFFER)

      if (toLoad.length === 0) return // No more chapters

      const loaded: LoadedChapter[] = []
      for (const summary of toLoad) {
        const chapter = await loadChapter(summary)
        if (chapter) loaded.push(chapter)
      }

      if (loaded.length > 0) {
        setChapters((prev) => {
          const combined = [...prev, ...loaded]
          combined.sort((a, b) => a.index - b.index)
          return combined
        })
      }
    } finally {
      setIsLoadingMore(false)
      loadingRef.current = false
    }
  }, [book, chapters, isLoadingMore, loadChapter])

  // Load previous chapters (for scrolling up)
  const loadPrev = useCallback(async () => {
    if (!book || loadingRef.current || isLoadingMore) return
    loadingRef.current = true
    setIsLoadingMore(true)

    try {
      // Find the first loaded chapter's index
      const firstLoaded = chapters[0]
      if (!firstLoaded || firstLoaded.index === 0) return

      const startIndex = Math.max(0, firstLoaded.index - CHAPTERS_BUFFER)
      const toLoad = book.chapters.slice(startIndex, firstLoaded.index)

      if (toLoad.length === 0) return

      const loaded: LoadedChapter[] = []
      for (const summary of toLoad) {
        const chapter = await loadChapter(summary)
        if (chapter) loaded.push(chapter)
      }

      if (loaded.length > 0) {
        setChapters((prev) => {
          const combined = [...loaded, ...prev]
          combined.sort((a, b) => a.index - b.index)
          return combined
        })
      }
    } finally {
      setIsLoadingMore(false)
      loadingRef.current = false
    }
  }, [book, chapters, isLoadingMore, loadChapter])

  // Evict chapters outside [visible - WINDOW, visible + WINDOW] to cap memory.
  // Snapshots visible chapter's top so layout effect can restore scroll after
  // React commits the shrunk list (removing top chapters shifts content up).
  useEffect(() => {
    if (chapters.length <= CHAPTERS_EVICT_WINDOW * 2 + 1) return
    const visibleArrayIdx = chapters.findIndex((c) => c.identifier === visibleIdentifier)
    if (visibleArrayIdx === -1) return

    const kept = chapters.filter((_, i) => Math.abs(i - visibleArrayIdx) <= CHAPTERS_EVICT_WINDOW)
    if (kept.length === chapters.length) return

    const visibleEl = chapterRefs.current.get(visibleIdentifier)
    if (visibleEl) {
      evictAnchorRef.current = {
        id: visibleIdentifier,
        top: visibleEl.getBoundingClientRect().top,
      }
    }

    const keptIds = new Set(kept.map((c) => c.identifier))
    chapters.forEach((c) => {
      if (!keptIds.has(c.identifier)) {
        loadedIdsRef.current.delete(c.identifier)
        chapterRefs.current.delete(c.identifier)
      }
    })
    setChapters(kept)
  }, [visibleIdentifier, chapters])

  // Restore scroll anchor after eviction so the user's viewport doesn't jump
  useLayoutEffect(() => {
    const anchor = evictAnchorRef.current
    if (!anchor) return
    const el = chapterRefs.current.get(anchor.id)
    if (el) {
      const newTop = el.getBoundingClientRect().top
      const delta = newTop - anchor.top
      if (delta !== 0) window.scrollBy({ top: delta, behavior: 'instant' })
    }
    evictAnchorRef.current = null
  }, [chapters])

  // Track visible chapter via IntersectionObserver (midline heuristic: chapter
  // whose bounds cross the viewport center is "active"). Avoids flipping to
  // next chapter while user is still reading tail of previous one.
  useEffect(() => {
    if (chapters.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the entry that's intersecting (crosses viewport middle).
        // Fallback: if multiple, pick the one with smallest abs(boundingClientRect.top).
        const intersecting = entries.filter((e) => e.isIntersecting)
        if (intersecting.length === 0) return

        let pick = intersecting[0]
        let pickTop = Math.abs(pick.boundingClientRect.top)
        for (let i = 1; i < intersecting.length; i++) {
          const t = Math.abs(intersecting[i].boundingClientRect.top)
          if (t < pickTop) {
            pick = intersecting[i]
            pickTop = t
          }
        }

        const identifier = (pick.target as HTMLElement).dataset.chapterId
        if (identifier) {
          setVisibleIdentifier((prev) => (prev === identifier ? prev : identifier))
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    )

    chapterRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [chapters])

  // Track scroll offset relative to visible chapter (used for progress %).
  // Separate RAF-throttled listener — cheap, runs always.
  useEffect(() => {
    let rafId = 0
    const updateOffset = () => {
      rafId = 0
      const visibleEl = chapterRefs.current.get(visibleIdentifier)
      if (visibleEl) {
        const rect = visibleEl.getBoundingClientRect()
        setScrollOffset(Math.abs(rect.top))
      }
    }
    const handleScroll = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(updateOffset)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    updateOffset()
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [visibleIdentifier])

  // Scroll to a specific chapter
  const scrollToChapter = useCallback((identifier: string) => {
    const el = chapterRefs.current.get(identifier)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const isAtEnd =
    !!book &&
    chapters.length > 0 &&
    chapters[chapters.length - 1].index === book.chapters.length - 1

  return {
    chapters,
    visibleIdentifier,
    isLoadingMore,
    loadError,
    scrollOffset,
    isAtEnd,
    loadMore,
    loadPrev,
    scrollToChapter,
    chapterRefs,
  }
}
