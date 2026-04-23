import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import type { Chapter, BookDetail } from '../types/api'
import { getUserBook, getUserBookChapter } from '../api/userBooks'
import { useReaderSettings } from '../hooks/useReaderSettings'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { useRestoreProgress } from '../hooks/useRestoreProgress'
import { useUserBookProgress } from '../hooks/useUserBookProgress'
import { useBookmarks } from '../hooks/useBookmarks'
import { useUserBookBookmarks } from '../hooks/useUserBookBookmarks'
import { useInBookSearch } from '../hooks/useInBookSearch'
import { useLibrary } from '../hooks/useLibrary'
import { useNetworkRecovery } from '../hooks/useNetworkRecovery'
import { useReaderKeyboard } from '../hooks/useReaderKeyboard'
import { useImmersiveMode } from '../hooks/useImmersiveMode'
import { getCachedChapter, cacheChapter } from '../lib/offlineDb'
import { InvalidContentTypeError } from '../lib/fetchWithRetry'
import { SeoHead } from '../components/SeoHead'
import { LocalizedLink } from '../components/LocalizedLink'
import { Toast } from '../components/Toast'
import { ReaderTopBar } from '../components/reader/ReaderTopBar'
import { ReaderContent } from '../components/reader/ReaderContent'
import { ReaderSection } from '../components/reader/ReaderSection'
import { ReaderNav } from '../components/reader/ReaderNav'
import { ReaderFooterNav } from '../components/reader/ReaderFooterNav'
import { ReaderSettingsDrawer } from '../components/reader/ReaderSettingsDrawer'
import { ReaderTocDrawer, type AutoSaveInfo, type TocChapter } from '../components/reader/ReaderTocDrawer'
import { ReaderSearchDrawer } from '../components/reader/ReaderSearchDrawer'
import { ReaderHighlights } from '../components/reader/ReaderHighlights'
import { SearchOverlayLayer } from '../components/reader/SearchOverlayLayer'
import { FEATURES, isReaderOverlayKillswitchSet } from '../lib/features'
import { useScrollReader } from '../hooks/useScrollReader'
import { useReadingSession } from '../hooks/useReadingSession'
import { useQuickStats } from '../hooks/useQuickStats'
import { calculateETF } from '../lib/etf'
import { trackBookOpened } from '../lib/analytics'
import { ReaderStatsWidget } from '../components/reader/ReaderStatsWidget'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { WordHint } from '../components/reader/WordHint'
import { SaveProgressPrompt } from '../components/reader/SaveProgressPrompt'
import '../styles/micro-practice.css'

export type ReaderMode = 'public' | 'userbook'

interface ReaderPageProps {
  mode?: ReaderMode
}

// Normalized chapter type for both modes
interface NormalizedChapter {
  id: string
  chapterNumber: number
  identifier: string // slug for public, chapterNumber as string for userbook
  title: string
  html: string
  wordCount: number | null
  prev: { identifier: string; title: string } | null
  next: { identifier: string; title: string } | null
}

// Normalized book type for both modes
interface NormalizedBook {
  id: string
  title: string
  totalWordCount?: number | null
  chapters: TocChapter[]
}

export function ReaderPage({ mode = 'public' }: ReaderPageProps) {
  // Get params based on mode - both modes now use slug
  const { bookSlug, chapterSlug, id, chapterSlug: userChapterSlug } = useParams<{
    bookSlug: string
    chapterSlug: string
    id: string
  }>()

  // For userbook mode, chapterSlug comes from the :chapterSlug param
  const chapterIdentifier = mode === 'public' ? chapterSlug : userChapterSlug

  const api = useApi()
  const { isAuthenticated, openAuthModal, ensureSession } = useAuth()
  const { language, getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  // Raw state for public books (needed for scroll reader, caching, etc.)
  const [publicChapter, setPublicChapter] = useState<Chapter | null>(null)
  const [publicBook, setPublicBook] = useState<BookDetail | null>(null)

  // Normalized state for both modes
  const [chapter, setChapter] = useState<NormalizedChapter | null>(null)
  const [book, setBook] = useState<NormalizedBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Highlight ID from URL — scroll to this highlight after chapter loads
  const [scrollToHighlightId] = useState(() => new URLSearchParams(window.location.search).get('highlight'))

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { settings, update } = useReaderSettings()

  // Bookmarks: server sync for both public and userbook modes
  // Public mode uses useBookmarks with editionId for server sync
  const publicBookmarks = useBookmarks(mode === 'public' ? (bookSlug || '') : '', {
    editionId: publicBook?.id,
    isAuthenticated,
  })
  // Userbook mode uses dedicated server-synced hook
  const userBookmarks = useUserBookBookmarks(mode === 'userbook' ? (id || '') : '')

  // Select which bookmark functions to use based on mode
  const { bookmarks, removeBookmark, isBookmarked, getBookmarkForChapter } =
    mode === 'public' ? publicBookmarks : userBookmarks

  // Wrap addBookmark to handle different signatures
  const addBookmark = useCallback(
    async (chapterSlug: string, chapterTitle: string) => {
      if (mode === 'public') {
        // Public mode needs chapterId for server sync
        const chapterId = publicChapter?.id
        return publicBookmarks.addBookmark(chapterSlug, chapterTitle, chapterId)
      } else {
        // Userbook mode - find chapterId from book chapters
        const ch = book?.chapters.find((c) => c.identifier === chapterSlug)
        return userBookmarks.addBookmark(ch?.id || '', chapterSlug, chapterTitle)
      }
    },
    [mode, publicChapter?.id, book?.chapters, publicBookmarks, userBookmarks]
  )
  const { add: addToLibrary, isInLibrary } = useLibrary()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [bookCompleted, setBookCompleted] = useState(false)
  const { setCurrentBook: setGuestCurrentBook } = useGuestLimits()

  // Soft reminder on every chapter transition for guests
  const [showChapterReminder, setShowChapterReminder] = useState(false)
  const prevChapterRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!chapterIdentifier || isAuthenticated) return
    if (prevChapterRef.current && prevChapterRef.current !== chapterIdentifier) {
      setShowChapterReminder(true)
    }
    prevChapterRef.current = chapterIdentifier
  }, [chapterIdentifier, isAuthenticated])

  // Pre-warm guest session on reader mount so first-word-tap doesn't race
  // ensureSession mid-popup, which would flip isAuthenticated and re-run the
  // chapter-fetch effect (reader reload + dropped popup). Single-flight inside.
  useEffect(() => {
    if (!isAuthenticated) {
      ensureSession().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on mount
  }, [])

  const libraryAddedRef = useRef(false)
  const editionIdRef = useRef<string | null>(null)
  const fetchedKeyRef = useRef<string | null>(null)
  const { markFetchStart, wasAbortedDueToWake } = useNetworkRecovery()

  const { immersiveMode, showBars: showImmersiveBars } = useImmersiveMode(true, loading)

  // Adapted book data for scroll reader (normalized to identifier-based interface)
  const scrollReaderBook = useMemo(() => {
    if (mode === 'public' && publicBook) {
      return {
        chapters: publicBook.chapters.map(c => ({
          identifier: c.slug,
          title: c.title,
          chapterNumber: c.chapterNumber,
          wordCount: c.wordCount,
        }))
      }
    }
    if (mode === 'userbook' && book) {
      return {
        chapters: book.chapters.map(c => ({
          identifier: c.identifier, // slug for userbook
          title: c.title,
          chapterNumber: c.chapterNumber,
          wordCount: c.wordCount ?? null,
        }))
      }
    }
    return null
  }, [mode, publicBook, book])

  // Fetch chapter callback for scroll reader (public)
  const fetchPublicChapter = useCallback(
    async (slug: string) => {
      const ch = await api.getChapter(bookSlug!, slug)
      return { identifier: ch.slug, title: ch.title, html: ch.html, wordCount: ch.wordCount }
    },
    [api, bookSlug]
  )

  // Fetch chapter callback for scroll reader (userbook) - now uses slug
  const fetchUserChapter = useCallback(
    async (slug: string) => {
      const ch = await getUserBookChapter(id!, slug)
      return { identifier: ch.slug || slug, title: ch.title, html: ch.html, wordCount: ch.wordCount }
    },
    [id]
  )

  // Scroll reader hook (for mobile continuous scroll)
  const scrollReader = useScrollReader({
    book: scrollReaderBook,
    initialIdentifier: mode === 'public' ? (chapterSlug || '') : (userChapterSlug || ''),
    bookId: mode === 'public' ? (publicBook?.id || '') : (id || ''),
    fetchChapter: mode === 'public' ? fetchPublicChapter : fetchUserChapter,
  })

  // Use visible chapter for bookmarks — URL chapterSlug doesn't update on replaceState
  const activeChapterIdentifier = scrollReader.visibleIdentifier || chapterIdentifier || ''
  const activeChapter = book?.chapters.find(c => c.identifier === activeChapterIdentifier)

  // Track current URL chapter (may differ from chapterSlug after replaceState)
  const currentUrlChapterRef = useRef(chapterIdentifier)

  // Sync URL with visible chapter from scroll reader (debounced 500ms — avoids
  // history.replaceState spam while user scrolls rapidly across chapter seams).
  useEffect(() => {
    const visibleId = scrollReader.visibleIdentifier
    if (!visibleId || visibleId === currentUrlChapterRef.current) return

    const timer = window.setTimeout(() => {
      if (visibleId === currentUrlChapterRef.current) return
      const newPath = mode === 'public'
        ? getLocalizedPath(`/books/${bookSlug}/${visibleId}`)
        : `/${language}/library/my/${id}/read/${visibleId}`
      window.history.replaceState(null, '', newPath)
      currentUrlChapterRef.current = visibleId
    }, 500)

    return () => clearTimeout(timer)
  }, [mode, scrollReader.visibleIdentifier, bookSlug, id, language, getLocalizedPath])

  // Reading progress sync (with server when authenticated) - public mode only
  const publicProgress = useReadingProgress(
    mode === 'public' ? (bookSlug || '') : '',
    mode === 'public' ? (chapterSlug || '') : '',
    { editionId: publicBook?.id, chapterId: publicChapter?.id, chapterSlug: chapterSlug }
  )

  // User book progress (localStorage) - userbook mode only
  const userProgress = useUserBookProgress(mode === 'userbook' ? (id || '') : '')

  // Migrate legacy progress (chapterNumber -> slug) for userbooks
  const legacyMigratedRef = useRef(false)
  useEffect(() => {
    if (mode !== 'userbook') return
    if (legacyMigratedRef.current) return
    if (!userProgress.legacyProgress || !book?.chapters) return

    legacyMigratedRef.current = true
    const legacyChapterNum = userProgress.legacyProgress.chapterNumber
    const targetChapter = book.chapters.find(c => c.chapterNumber === legacyChapterNum)
    if (targetChapter) {
      // Navigate to the saved chapter using slug
      const qs = window.location.search
      navigate(`/${language}/library/my/${id}/read/${targetChapter.identifier}` + qs, { replace: true })
    }
  }, [mode, userProgress.legacyProgress, book?.chapters, navigate, language, id])

  // Restore progress on mount - public mode only (user books restore handled separately).
  // URL is authoritative: we never auto-navigate away from a typed chapter URL.
  const { savedProgress, isLoading: progressLoading } =
    useRestoreProgress(mode === 'public' ? publicBook?.id : undefined, chapterSlug)

  // Unified progress for restore effects (public + userbook)
  const effectiveProgress = mode === 'public' ? savedProgress : (
    userProgress.savedProgress ? {
      chapterSlug: userProgress.savedProgress.chapterSlug,
      locator: userProgress.savedProgress.locator || '',
      percent: userProgress.savedProgress.percent,
    } : null
  )
  const effectiveLoading = mode === 'public' ? progressLoading : userProgress.isLoading

  // Auto-save info for bookmarks drawer
  const autoSaveInfo = useMemo((): AutoSaveInfo | null => {
    if (mode === 'public') {
      if (!publicBook?.id || !publicBook?.chapters) return null
      try {
        const stored = localStorage.getItem(`reading.progress.${publicBook.id}`)
        if (!stored) return null
        const data = JSON.parse(stored) as { chapterSlug: string; locator: string; percent: number }
        if (!data.chapterSlug) return null
        const chapter = publicBook.chapters.find(c => c.slug === data.chapterSlug)
        if (!chapter) return null
        return {
          chapterSlug: data.chapterSlug,
          chapterTitle: chapter.title,
          locator: data.locator,
          percent: data.percent,
        }
      } catch {
        return null
      }
    } else {
      // Userbook mode - use server-synced progress
      if (!book?.chapters || !userProgress.savedProgress?.chapterSlug) return null
      const chapter = book.chapters.find(c => c.identifier === userProgress.savedProgress?.chapterSlug)
      if (!chapter) return null
      return {
        chapterSlug: userProgress.savedProgress.chapterSlug,
        chapterTitle: chapter.title,
        locator: userProgress.savedProgress.locator || '',
        percent: userProgress.savedProgress.percent,
      }
    }
  }, [mode, publicBook?.id, publicBook?.chapters, book?.chapters, userProgress.savedProgress])

  // Refs for restore logic
  const scrollRestoredRef = useRef(false)

  // Overlay-path scroll progress (single chapter mounted, native window scroll).
  // Legacy multi-chapter path uses `chapterScrollProgress` below.
  const overlayV2Enabled = FEATURES.readerOverlayV2 && !isReaderOverlayKillswitchSet()
  const [overlayScrollProgress, setOverlayScrollProgress] = useState(0)
  useEffect(() => {
    if (!overlayV2Enabled) return
    const read = () => {
      const doc = document.scrollingElement || document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      if (max <= 0) { setOverlayScrollProgress(0); return }
      setOverlayScrollProgress(Math.min(1, Math.max(0, doc.scrollTop / max)))
    }
    read()
    window.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('scroll', read)
      window.removeEventListener('resize', read)
    }
  }, [overlayV2Enabled, chapter?.id])

  // Current chapter progress (0..1) based on scroll within the visible chapter.
  // Drives both book-level overallProgress and chapter-level ETF.
  const chapterScrollProgress = useMemo(() => {
    const currentId = scrollReader.visibleIdentifier
    if (!currentId) return 0
    const chapterEl = scrollReader.chapterRefs.current.get(currentId)
    if (!chapterEl) return 0
    const h = chapterEl.scrollHeight
    if (h <= 0) return 0
    return Math.min(1, Math.max(0, scrollReader.scrollOffset / h))
  }, [scrollReader.visibleIdentifier, scrollReader.scrollOffset, scrollReader.chapterRefs])

  // Calculate overall book progress based on word counts
  const calculatedProgress = useMemo(() => {
    if (!scrollReaderBook) return 0
    const chapters = scrollReaderBook.chapters
    const currentId = scrollReader.visibleIdentifier
    if (!currentId) return 0

    const currentChapterIndex = chapters.findIndex(c => c.identifier === currentId)
    if (currentChapterIndex === -1) return 0

    const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
    if (totalWords === 0) {
      return (currentChapterIndex + chapterScrollProgress) / chapters.length
    }

    const wordsBeforeCurrent = chapters
      .slice(0, currentChapterIndex)
      .reduce((sum, c) => sum + (c.wordCount || 0), 0)
    const currentChapterWords = chapters[currentChapterIndex].wordCount || 0
    const wordsRead = wordsBeforeCurrent + currentChapterWords * chapterScrollProgress

    return wordsRead / totalWords
  }, [scrollReaderBook, scrollReader.visibleIdentifier, chapterScrollProgress])

  // Force 100% when book is completed
  const rawProgress = bookCompleted ? 1 : calculatedProgress

  // Clamp progress monotonically within a session: scrolling down must never
  // reduce the bar. Fixes jitter from chapter-boundary scroll handoff and
  // Math.round flipping between 99/100.
  const maxProgressRef = useRef(0)
  useEffect(() => {
    maxProgressRef.current = 0
  }, [book?.id])
  if (rawProgress > maxProgressRef.current) maxProgressRef.current = rawProgress
  const overallProgress = maxProgressRef.current

  // Reading session tracking (time, words)
  const readingSession = useReadingSession({
    editionId: mode === 'public' ? publicBook?.id : undefined,
    userBookId: mode === 'userbook' ? id : undefined,
    totalWords: mode === 'public' && publicBook
      ? publicBook.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
      : undefined,
    startPercent: overallProgress,
    isAuthenticated,
  })

  // Sync percent to reading session tracker
  useEffect(() => {
    readingSession.updatePercent(overallProgress)
  }, [overallProgress, readingSession])

  // GA4: fire once per mount when the book is first resolved. Keyed on
  // editionId/userBookId so a re-mount on navigation fires again, but
  // re-renders within the same open don't double-count.
  const bookOpenedFiredRef = useRef<string | null>(null)
  useEffect(() => {
    const editionId = mode === 'public' ? publicBook?.id : undefined
    const userBookId = mode === 'userbook' ? id : undefined
    const key = editionId || userBookId
    if (!key) return
    if (bookOpenedFiredRef.current === key) return
    bookOpenedFiredRef.current = key
    trackBookOpened({
      source: mode === 'public' ? 'library' : 'userbook',
      editionId: editionId || null,
      userBookId: userBookId || null,
      // NormalizedBook doesn't carry language; fall back to the UI language
      // from the route, which is the same locale the reader is rendered in.
      language: mode === 'public' ? publicBook?.language : language,
    })
  }, [mode, publicBook?.id, publicBook?.language, id, language])

  // ETF & reader stats
  const quickStats = useQuickStats()
  const userWpm = quickStats?.wpm ?? null

  const bookTotalWords = useMemo(() => {
    if (mode === 'public' && publicBook) {
      return publicBook.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
    }
    if (mode === 'userbook' && book) {
      return book.totalWordCount || book.chapters.reduce((sum: number, c: any) => sum + (c.wordCount || 0), 0)
    }
    return 0
  }, [mode, publicBook, book])

  const bookEtf = useMemo(
    () => calculateETF(bookTotalWords, overallProgress, userWpm),
    [bookTotalWords, overallProgress, userWpm],
  )

  const totalChapters = scrollReaderBook?.chapters.length ?? 0
  const currentChapterIndex = useMemo(() => {
    if (!scrollReaderBook) return -1
    const id = scrollReader.visibleIdentifier || chapterIdentifier
    if (!id) return -1
    return scrollReaderBook.chapters.findIndex(c => c.identifier === id)
  }, [scrollReaderBook, scrollReader.visibleIdentifier, chapterIdentifier])

  // Track scroll activity for reading session
  useEffect(() => {
    let lastScroll = 0
    const handleScroll = () => {
      const now = Date.now()
      if (now - lastScroll > 5000) { // throttle: once per 5s
        lastScroll = now
        readingSession.recordActivity()
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [readingSession])

  // Sync progress when scroll position changes
  // Time-based skip: avoid redundant saves within 2s window (aligns with 600ms debounce)
  const lastScrollSaveRef = useRef<{ identifier: string; offset: number; timestamp: number } | null>(null)
  const scrollSaveTimerRef = useRef<number | null>(null)
  // Store pending scroll save data for flush on visibility/unload
  const pendingScrollSaveRef = useRef<{
    identifier: string
    offset: number
    progress: number
  } | null>(null)

  // Flush pending scroll save immediately: populate the hook's pending ref via
  // updateProgress/saveProgress, then call the hook's flushSave() synchronously so
  // the request leaves via keepalive fetch before the tab dies. Without the second
  // call we'd only schedule the hook's 2s debounce — likely to lose the write on
  // unload (beforeunload handler order isn't guaranteed).
  const flushScrollSave = useCallback(() => {
    const pending = pendingScrollSaveRef.current
    if (!pending) return

    if (scrollSaveTimerRef.current) {
      clearTimeout(scrollSaveTimerRef.current)
      scrollSaveTimerRef.current = null
    }

    const { identifier, offset, progress } = pending
    const scrollLocator = `scroll:${identifier}:${Math.round(offset)}`

    if (mode === 'public' && publicBook?.chapters) {
      const bookChapter = publicBook.chapters.find(c => c.slug === identifier)
      if (bookChapter) {
        publicProgress.updateProgress(progress, undefined, scrollLocator, bookChapter.id, identifier)
        publicProgress.flushSave()
      }
    } else if (mode === 'userbook') {
      userProgress.saveProgress(identifier, 0, progress, scrollLocator)
      userProgress.flushSave()
    }

    pendingScrollSaveRef.current = null
  }, [mode, publicBook?.chapters, publicProgress, userProgress])

  useEffect(() => {
    if (!scrollRestoredRef.current) return // Don't save until scroll position is restored

    const visibleId = scrollReader.visibleIdentifier
    const offset = scrollReader.scrollOffset
    if (!visibleId) return

    const now = Date.now()
    const last = lastScrollSaveRef.current

    // Chapter change always triggers save (important for navigation tracking)
    const chapterChanged = !last || last.identifier !== visibleId

    // Within same chapter: skip if saved within last 2s (time-based, not distance-based)
    // This avoids skipping important mid-chapter positions on slow scrolling or short chapters
    if (!chapterChanged && last && (now - last.timestamp) < 2000) return

    // Update ref immediately to prevent duplicate saves
    lastScrollSaveRef.current = { identifier: visibleId, offset, timestamp: now }

    // Store pending save data for flush on visibility/unload
    pendingScrollSaveRef.current = { identifier: visibleId, offset, progress: overallProgress }

    // Debounce the actual save (600ms per ADR-007 spec: 500-800ms)
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)

    // Capture current values for the timeout callback
    const saveId = visibleId
    const saveOffset = offset
    const saveProgress = overallProgress

    scrollSaveTimerRef.current = window.setTimeout(() => {
      if (mode === 'public' && publicBook?.chapters) {
        // Public mode: use server sync
        const bookChapter = publicBook.chapters.find(c => c.slug === saveId)
        if (bookChapter) {
          const scrollLocator = `scroll:${saveId}:${Math.round(saveOffset)}`
          publicProgress.updateProgress(saveProgress, undefined, scrollLocator, bookChapter.id, saveId)
        }
      } else if (mode === 'userbook') {
        // Userbook mode: save to localStorage + server with scroll locator
        const scrollLocator = `scroll:${saveId}:${Math.round(saveOffset)}`
        userProgress.saveProgress(saveId, 0, saveProgress, scrollLocator)
      }
      pendingScrollSaveRef.current = null
      scrollSaveTimerRef.current = null
    }, 600)
  }, [mode, publicBook?.chapters, scrollReader.visibleIdentifier, scrollReader.scrollOffset, overallProgress, publicProgress, userProgress])

  // Flush pending save on visibility hidden or unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushScrollSave()
      }
    }

    const handleBeforeUnload = () => {
      flushScrollSave()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Flush on unmount as well
      flushScrollSave()
    }
  }, [flushScrollSave])

  // Track current book for guest returning user feature
  useEffect(() => {
    if (isAuthenticated || !bookSlug || !chapterIdentifier) return
    setGuestCurrentBook({ bookSlug, chapterSlug: chapterIdentifier })
  }, [isAuthenticated, bookSlug, chapterIdentifier, setGuestCurrentBook])

  // Auto-add to library after 1% overall progress
  useEffect(() => {
    if (!book?.id || libraryAddedRef.current) return
    if (overallProgress < 0.01) return
    if (isInLibrary(book.id)) {
      libraryAddedRef.current = true
      return
    }
    libraryAddedRef.current = true
    addToLibrary(book.id)
      .then(() => setToastMessage('Added to library'))
      .catch(() => {}) // silent fail
  }, [overallProgress, book?.id, isInLibrary, addToLibrary])

  // Restore scroll position
  useEffect(() => {
    if (scrollRestoredRef.current || effectiveLoading) return
    if (scrollReader.chapters.length === 0) return // Wait for chapters to load

    // Parse scroll locator: scroll:{chapterSlug}:{offset}
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
    if (isNaN(savedOffset)) {
      scrollRestoredRef.current = true
      return
    }

    // Check if chapter is in the loaded list
    const chapterLoaded = scrollReader.chapters.some(c => c.identifier === savedSlug)
    if (!chapterLoaded) {
      // Chapter not loaded yet - effect will re-run when chapters change
      return
    }

    // Try to scroll with retry for DOM timing
    let retries = 0
    const maxRetries = 5
    const tryScroll = () => {
      const chapterEl = scrollReader.chapterRefs.current.get(savedSlug)
      if (!chapterEl) {
        if (retries < maxRetries) {
          retries++
          requestAnimationFrame(tryScroll)
          return
        }
        // Max retries reached - give up
        scrollRestoredRef.current = true
        return
      }

      // Scroll to chapter position + offset (offsetTop gives absolute position in document)
      window.scrollTo({ top: chapterEl.offsetTop + savedOffset, behavior: 'instant' })
      // Only mark as restored AFTER successful scroll
      scrollRestoredRef.current = true
    }

    requestAnimationFrame(tryScroll)
  }, [effectiveLoading, effectiveProgress, scrollReader.chapters, scrollReader.chapterRefs])

  // Reset restore refs on chapter change
  useEffect(() => {
    scrollRestoredRef.current = false
  }, [chapterIdentifier])

  // Search hook needs chapter html, use empty string until loaded
  const chapterHtml = chapter?.html || ''
  const {
    query: searchQuery,
    matches: searchMatches,
    activeMatchIndex,
    search,
    nextMatch,
    prevMatch,
    goToMatch,
    clear: clearSearch,
  } = useInBookSearch(chapterHtml)

  // Fetch chapter and book data
  useEffect(() => {
    // Public mode requires bookSlug and chapterSlug
    if (mode === 'public' && (!bookSlug || !chapterSlug)) return
    // User mode requires id and chapterSlug, plus auth
    if (mode === 'userbook' && (!id || !userChapterSlug || !isAuthenticated)) return

    const fetchKey = mode === 'public'
      ? `public:${bookSlug}:${chapterSlug}`
      : `userbook:${id}:${userChapterSlug}`
    // Already loaded this exact path — an isAuthenticated flip (guest creation)
    // or unrelated re-render shouldn't force a loading flash / drop the popup.
    if (fetchedKeyRef.current === fetchKey) return

    let cancelled = false
    if (mode === 'public') markFetchStart()

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        if (mode === 'public') {
          // Try cache first if we have editionId
          const cachedEditionId = editionIdRef.current
          if (cachedEditionId) {
            const cached = await getCachedChapter(cachedEditionId, chapterSlug!)
            if (cached && !cancelled) {
              // Set raw public chapter
              const rawChapter: Chapter = {
                id: cached.key,
                chapterNumber: 0,
                slug: cached.chapterSlug,
                title: cached.title,
                html: cached.html,
                wordCount: cached.wordCount,
                prev: cached.prev,
                next: cached.next,
              }
              setPublicChapter(rawChapter)
              // Normalize for UI
              setChapter({
                id: rawChapter.id,
                chapterNumber: rawChapter.chapterNumber,
                identifier: rawChapter.slug,
                title: rawChapter.title,
                html: rawChapter.html,
                wordCount: rawChapter.wordCount,
                prev: rawChapter.prev ? { identifier: rawChapter.prev.slug, title: rawChapter.prev.title } : null,
                next: rawChapter.next ? { identifier: rawChapter.next.slug, title: rawChapter.next.title } : null,
              })
              // Still need book for TOC - fetch it
              try {
                const bk = await api.getBook(bookSlug!)
                if (!cancelled) {
                  setPublicBook(bk)
                  setBook({
                    id: bk.id,
                    title: bk.title,
                    chapters: bk.chapters.map(c => ({
                      id: c.id,
                      identifier: c.slug,
                      title: c.title,
                      chapterNumber: c.chapterNumber,
                    })),
                  })
                }
              } catch {
                // Book fetch failed but chapter from cache - ok
              }
              fetchedKeyRef.current = fetchKey
              setLoading(false)
              return
            }
          }

          // Cache miss or no editionId - fetch from API
          const [ch, bk] = await Promise.all([
            api.getChapter(bookSlug!, chapterSlug!),
            api.getBook(bookSlug!),
          ])

          if (cancelled) return

          // Set raw data
          setPublicChapter(ch)
          setPublicBook(bk)
          editionIdRef.current = bk.id

          // Normalize for UI
          setChapter({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            identifier: ch.slug,
            title: ch.title,
            html: ch.html,
            wordCount: ch.wordCount,
            prev: ch.prev ? { identifier: ch.prev.slug, title: ch.prev.title } : null,
            next: ch.next ? { identifier: ch.next.slug, title: ch.next.title } : null,
          })
          setBook({
            id: bk.id,
            title: bk.title,
            chapters: bk.chapters.map(c => ({
              id: c.id,
              identifier: c.slug,
              title: c.title,
              chapterNumber: c.chapterNumber,
            })),
          })

          // Cache for offline use
          cacheChapter(bk.id, ch).catch(() => {})
          fetchedKeyRef.current = fetchKey
        } else {
          // User book mode - now uses slug
          const [bk, ch] = await Promise.all([
            getUserBook(id!),
            getUserBookChapter(id!, userChapterSlug!),
          ])

          if (cancelled) return

          // Normalize for UI - use slug as identifier
          setChapter({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            identifier: ch.slug || userChapterSlug!,
            title: ch.title,
            html: ch.html,
            wordCount: ch.wordCount,
            prev: ch.previous ? { identifier: ch.previous.slug || String(ch.previous.chapterNumber), title: ch.previous.title } : null,
            next: ch.next ? { identifier: ch.next.slug || String(ch.next.chapterNumber), title: ch.next.title } : null,
          })
          setBook({
            id: bk.id,
            title: bk.title,
            totalWordCount: bk.totalWordCount,
            chapters: bk.chapters.map(c => ({
              id: c.id,
              identifier: c.slug || String(c.chapterNumber),
              title: c.title,
              chapterNumber: c.chapterNumber,
              wordCount: c.wordCount,
            })),
          })
          fetchedKeyRef.current = fetchKey
        }
      } catch (err) {
        if (cancelled) return
        // If aborted due to wake, auto-retry (public mode only)
        if (mode === 'public' && wasAbortedDueToWake()) {
          fetchData()
          return
        }
        if (err instanceof InvalidContentTypeError) {
          setError('Chapter not found. The book may have been removed.')
        } else {
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [mode, bookSlug, chapterSlug, id, userChapterSlug, isAuthenticated, api, markFetchStart, wasAbortedDueToWake])

  // Chapter URL helper
  const getChapterUrl = useCallback((identifier: string) => {
    if (mode === 'public') {
      return getLocalizedPath(`/books/${bookSlug}/${identifier}`)
    }
    return `/${language}/library/my/${id}/read/${identifier}`
  }, [mode, bookSlug, id, language, getLocalizedPath])

  // Back URL
  const backUrl = mode === 'public'
    ? `/books/${bookSlug}`
    : `/${language}/library/my/${id}`

  useReaderKeyboard({
    tocOpen,
    settingsOpen,
    searchOpen,
    setTocOpen,
    setSettingsOpen,
    setSearchOpen,
    clearSearch,
  })

  // Auth check for userbook mode
  if (mode === 'userbook' && !isAuthenticated) {
    return (
      <div className="reader-page">
        <SeoHead title="Reader" noindex />
        <div className="reader-error">
          <h2>Sign in required</h2>
          <p>Sign in to read your uploaded books.</p>
          <Link to={`/${language}/library`} className="reader-error__home-link">
            Back to Library
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="reader-page">
        <SeoHead title="Loading..." noindex />
        <div className="reader-loading">
          <div className="reader-loading__skeleton" />
          <div className="reader-loading__skeleton" />
          <div className="reader-loading__skeleton" />
        </div>
      </div>
    )
  }

  if (error || !chapter || !book) {
    const errorBackUrl = mode === 'public' ? '/' : `/${language}/library/my/${id}`
    const errorBackText = mode === 'public' ? 'Back to Home' : 'Back to Book'
    const ErrorLink = mode === 'public' ? LocalizedLink : Link
    return (
      <div className="reader-page">
        <SeoHead title="Error" noindex />
        <div className="reader-error">
          <h2>Error loading chapter</h2>
          <p>{error || 'Chapter not found'}</p>
          <ErrorLink to={errorBackUrl} className="reader-error__home-link">
            {errorBackText}
          </ErrorLink>
        </div>
      </div>
    )
  }

  const seoTitle = `${chapter.title} — ${book.title}`
  const seoDescription = `Read ${chapter.title} from ${book.title} online | TextStack Reader`

  const immersiveClass = immersiveMode ? 'immersive-mode' : ''

  return (
    <div className={`reader-page ${immersiveClass}`}>
      <SeoHead title={seoTitle} description={seoDescription} noindex />
      <a href="#reader-content" className="skip-link">Skip to content</a>
      <ReaderTopBar
        visible={!immersiveMode}
        title={book.title}
        chapterTitle={activeChapter?.title || chapter.title}
        progress={overallProgress}
        isBookmarked={isBookmarked(activeChapterIdentifier)}
        backUrl={backUrl}
        useLocalizedLink={mode === 'public'}
        onSearchClick={() => setSearchOpen(true)}
        onTocClick={() => setTocOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        onBookmarkClick={() => {
          const bookmark = getBookmarkForChapter(activeChapterIdentifier)
          if (bookmark) {
            removeBookmark(bookmark.id)
          } else if (activeChapter) {
            addBookmark(activeChapterIdentifier, activeChapter.title)
          }
        }}
      />

      <main id="reader-content" className="reader-main">
        <ReaderHighlights
          editionId={book?.id || ''}
          chapterId={activeChapter?.id || ''}
          containerRef={scrollContainerRef}
          isAuthenticated={isAuthenticated}
          bookLanguage={publicBook?.language}
          bookTitle={book?.title}
          userBookId={mode === 'userbook' ? id : undefined}
          ttsSpeed={settings.ttsSpeed}
          showInlineTranslations={settings.showInlineTranslations}
          scrollToHighlightId={scrollToHighlightId}
        >
          <div ref={scrollContainerRef}>
            {overlayV2Enabled ? (
              <>
                <ReaderSection
                  chapterId={chapter.id}
                  chapterIndex={chapter.chapterNumber}
                  html={chapter.html}
                  settings={settings}
                  onTap={() => { readingSession.recordActivity(); showImmersiveBars() }}
                />
                <ReaderNav
                  chapterTitle={chapter.title}
                  chapterNumber={chapter.chapterNumber}
                  totalChapters={totalChapters || null}
                  chapterProgress={overlayScrollProgress}
                  onPrev={chapter.prev ? () => navigate(getChapterUrl(chapter.prev!.identifier)) : null}
                  onNext={chapter.next ? () => navigate(getChapterUrl(chapter.next!.identifier)) : null}
                />
              </>
            ) : (
              <ReaderContent
                chapters={scrollReader.chapters}
                settings={settings}
                isLoadingMore={scrollReader.isLoadingMore}
                isAtEnd={scrollReader.isAtEnd}
                libraryHref={mode === 'public' ? getLocalizedPath('/library') : `/${language}/library/my`}
                homeHref={mode === 'public' ? getLocalizedPath('/') : `/${language}`}
                bookDetailHref={mode === 'public' && bookSlug ? getLocalizedPath(`/books/${bookSlug}`) : undefined}
                onLoadMore={scrollReader.loadMore}
                onLoadPrev={scrollReader.loadPrev}
                chapterRefs={scrollReader.chapterRefs}
                onTap={() => { readingSession.recordActivity(); showImmersiveBars() }}
              />
            )}
          </div>
          {overlayV2Enabled && searchOpen && (
            <SearchOverlayLayer
              containerRef={scrollContainerRef}
              query={searchQuery}
              activeMatchIndex={activeMatchIndex}
            />
          )}
        </ReaderHighlights>
      </main>

      {settings.showReaderStats && (
        <ReaderStatsWidget
          sessionStartedAt={readingSession.sessionStartedAt}
          quickStats={quickStats}
          bookEtf={bookEtf?.formatted}
        />
      )}

      <ReaderFooterNav
        chapterTitle={activeChapter?.title || chapter.title}
        overallProgress={overallProgress}
        currentChapterIndex={currentChapterIndex}
        totalChapters={totalChapters}
      />

      <ReaderTocDrawer
        open={tocOpen}
        chapters={book.chapters}
        currentChapterIdentifier={activeChapterIdentifier}
        bookmarks={bookmarks}
        autoSave={autoSaveInfo}
        getChapterUrl={getChapterUrl}
        useLocalizedLink={mode === 'public'}
        onClose={() => setTocOpen(false)}
        onRemoveBookmark={removeBookmark}
        onChapterSelect={(identifier) => {
          const isLoaded = scrollReader.chapters.some(c => c.identifier === identifier)
          if (isLoaded) {
            scrollReader.scrollToChapter(identifier)
          } else {
            navigate(getChapterUrl(identifier) + '?direct=1')
          }
        }}
      />

      <ReaderSettingsDrawer
        open={settingsOpen}
        settings={settings}
        onUpdate={update}
        onClose={() => setSettingsOpen(false)}
      />

      <ReaderSearchDrawer
        open={searchOpen}
        query={searchQuery}
        matches={searchMatches}
        activeMatchIndex={activeMatchIndex}
        onSearch={search}
        onGoToMatch={goToMatch}
        onNextMatch={nextMatch}
        onPrevMatch={prevMatch}
        onClose={() => {
          setSearchOpen(false)
          clearSearch()
        }}
      />

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      {bookCompleted && (
        <div className="reader-complete-overlay" onClick={() => setBookCompleted(false)}>
          <div className="reader-complete" onClick={e => e.stopPropagation()}>
            <h2>You've finished this book</h2>
            <p className="reader-complete__title">{book.title}</p>
            <div className="reader-complete__actions">
              {mode === 'public' ? (
                <LocalizedLink to={backUrl} className="reader-complete__btn">
                  Back to Book
                </LocalizedLink>
              ) : (
                <Link to={backUrl} className="reader-complete__btn">
                  Back to Book
                </Link>
              )}
              <button
                className="reader-complete__btn reader-complete__btn--secondary"
                onClick={() => setBookCompleted(false)}
              >
                Keep Reading
              </button>
            </div>
          </div>
        </div>
      )}

      <WordHint containerRef={scrollContainerRef} />

      <SaveProgressPrompt
        visible={showChapterReminder}
        onAccept={() => {
          setShowChapterReminder(false)
          openAuthModal()
        }}
        onDismiss={() => {
          setShowChapterReminder(false)
        }}
      />

    </div>
  )
}
