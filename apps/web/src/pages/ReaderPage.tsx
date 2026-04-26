import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useReaderSettings } from '../hooks/useReaderSettings'
import { useReaderChapter, type ReaderMode } from '../hooks/useReaderChapter'
import { useReaderScrollSync } from '../hooks/useReaderScrollSync'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { useRestoreProgress } from '../hooks/useRestoreProgress'
import { useUserBookProgress } from '../hooks/useUserBookProgress'
import { useBookmarks } from '../hooks/useBookmarks'
import { useUserBookBookmarks } from '../hooks/useUserBookBookmarks'
import { useInBookSearch } from '../hooks/useInBookSearch'
import { useLibrary } from '../hooks/useLibrary'
import { useReaderKeyboard } from '../hooks/useReaderKeyboard'
import { useImmersiveMode } from '../hooks/useImmersiveMode'
import { SeoHead } from '../components/SeoHead'
import { LocalizedLink } from '../components/LocalizedLink'
import { Toast } from '../components/Toast'
import { ReaderTopBar } from '../components/reader/ReaderTopBar'
import { ReaderSection } from '../components/reader/ReaderSection'
import { ReaderNav } from '../components/reader/ReaderNav'
import { ReaderFooterNav } from '../components/reader/ReaderFooterNav'
import { ReaderSettingsDrawer } from '../components/reader/ReaderSettingsDrawer'
import { ReaderTocDrawer, type AutoSaveInfo } from '../components/reader/ReaderTocDrawer'
import { ReaderSearchDrawer } from '../components/reader/ReaderSearchDrawer'
import { ReaderHighlights } from '../components/reader/ReaderHighlights'
import { SearchOverlayLayer } from '../components/reader/SearchOverlayLayer'
import { useReadingSession } from '../hooks/useReadingSession'
import { useQuickStats } from '../hooks/useQuickStats'
import { calculateETF } from '../lib/etf'
import { trackBookOpened } from '../lib/analytics'
import { ReaderStatsWidget } from '../components/reader/ReaderStatsWidget'
import { useGuestLimits } from '../context/GuestLimitsContext'
import { WordHint } from '../components/reader/WordHint'
import { SaveProgressPrompt } from '../components/reader/SaveProgressPrompt'
import '../styles/micro-practice.css'

export type { ReaderMode } from '../hooks/useReaderChapter'

interface ReaderPageProps {
  mode?: ReaderMode
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

  const { isAuthenticated, openAuthModal, ensureSession } = useAuth()
  const { language, getLocalizedPath } = useLanguage()
  const navigate = useNavigate()

  const { chapter, book, publicChapter, publicBook, loading, error } = useReaderChapter({
    mode,
    bookSlug,
    chapterSlug,
    userBookId: id,
    userChapterSlug,
    isAuthenticated,
  })

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

  const { immersiveMode, showBars: showImmersiveBars } = useImmersiveMode(true, loading)

  // Chapter list for progress + TOC. URL chapter is authoritative — single
  // chapter mounted per view.
  const chapterList = useMemo(() => {
    if (mode === 'public' && publicBook) {
      return publicBook.chapters.map(c => ({
        identifier: c.slug,
        title: c.title,
        chapterNumber: c.chapterNumber,
        wordCount: c.wordCount,
      }))
    }
    if (mode === 'userbook' && book) {
      return book.chapters.map(c => ({
        identifier: c.identifier,
        title: c.title,
        chapterNumber: c.chapterNumber,
        wordCount: c.wordCount ?? null,
      }))
    }
    return null
  }, [mode, publicBook, book])

  const activeChapterIdentifier = chapterIdentifier || ''
  const activeChapter = book?.chapters.find(c => c.identifier === activeChapterIdentifier)

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

  // Single chapter mounted; native window scroll drives intra-chapter progress.
  const [overlayScrollProgress, setOverlayScrollProgress] = useState(0)
  useEffect(() => {
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
  }, [chapter?.id])

  // Overall book progress = words-read / total-words across chapters,
  // driven by URL chapter + intra-chapter scroll.
  const calculatedProgress = useMemo(() => {
    if (!chapterList) return 0
    const currentId = chapterIdentifier || ''
    if (!currentId) return 0
    const currentChapterIndex = chapterList.findIndex(c => c.identifier === currentId)
    if (currentChapterIndex === -1) return 0

    const totalWords = chapterList.reduce((sum, c) => sum + (c.wordCount || 0), 0)
    if (totalWords === 0) {
      return (currentChapterIndex + overlayScrollProgress) / chapterList.length
    }

    const wordsBeforeCurrent = chapterList
      .slice(0, currentChapterIndex)
      .reduce((sum, c) => sum + (c.wordCount || 0), 0)
    const currentChapterWords = chapterList[currentChapterIndex].wordCount || 0
    const wordsRead = wordsBeforeCurrent + currentChapterWords * overlayScrollProgress

    return wordsRead / totalWords
  }, [chapterList, chapterIdentifier, overlayScrollProgress])

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

  const totalChapters = chapterList?.length ?? 0
  const currentChapterIndex = useMemo(() => {
    if (!chapterList) return -1
    const id = chapterIdentifier || ''
    if (!id) return -1
    return chapterList.findIndex(c => c.identifier === id)
  }, [chapterList, chapterIdentifier])

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

  // Scroll-position restore + debounced save + flush on visibility/unload.
  useReaderScrollSync({
    mode,
    chapterIdentifier,
    chapterLoaded: !!chapter,
    overallProgress,
    effectiveProgress,
    effectiveLoading,
    publicBookChapters: publicBook?.chapters,
    publicProgress,
    userProgress,
  })

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
          </div>
          {searchOpen && (
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
          navigate(getChapterUrl(identifier) + '?direct=1')
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
