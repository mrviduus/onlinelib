import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { useRouter, Stack } from 'expo-router'
import { t, computeBookProgress, estimateTimeLeft, formatMinutesLeft, citationChapterSlug, makeSnippet, resolveOpenPage } from '@textstack/shared'
import type { Chapter, BookmarkDto, AskCitation, AskTarget } from '@textstack/shared'
import { buildReaderHtml, buildPdfViewerHtml } from '../../lib/readerHtml'
import { getAccessToken, onUnauthorized, API_URL } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useReaderSettings } from '../../hooks/useReaderSettings'
import { useReaderBars } from '../../hooks/useReaderBars'
import { useKeepReaderAwake } from '../../hooks/useKeepReaderAwake'
import { useReadingPace } from '../../hooks/useReadingPace'
import { useReaderExitSummary } from '../../hooks/useReaderExitSummary'
import { useReaderHighlights } from '../../hooks/useReaderHighlights'
import { useReaderVocabMap } from '../../hooks/useReaderVocabMap'
import { useReaderVocabActions } from '../../hooks/useReaderVocabActions'
import { useReaderSelection } from '../../hooks/useReaderSelection'
import { useReaderOverlayV2Active } from '../../hooks/useReaderOverlayV2Active'
import { useReadingSession } from '../../hooks/useReadingSession'
import { useTts } from '../../hooks/useTts'
import { useQuickStats } from '../../hooks/useQuickStats'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../../context/ToastContext'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { useNativeLanguage } from '../../context/NativeLanguageContext'
import { ReaderSettingsDrawer } from '../ReaderSettingsDrawer'
import { BookmarksSheet } from '../BookmarksSheet'
import { HighlightsSheet } from '../HighlightsSheet'
import { SelectionActionBar } from '../SelectionActionBar'
import { TranslationSheet } from '../TranslationSheet'
import { ExplanationSheet } from '../ExplanationSheet'
import { AskSheet, type AskPrefill } from '../AskSheet'
import { HighlightNoteModal } from '../HighlightNoteModal'
import { TocSheet } from '../TocSheet'
import { ReaderStatsWidget } from '../ReaderStatsWidget'
import { ReaderTapCoachmark } from './ReaderTapCoachmark'
import { ReaderTopBar } from './ReaderTopBar'
import { PdfReaderChrome } from './PdfReaderChrome'
import { Ionicons } from '@expo/vector-icons'
import { fonts } from '../../theme/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

/** Lightweight {key} interpolation — shared `t()` returns raw keys, we fill them in here. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

/** Which catalog the book belongs to. Drives the FK column used by highlights,
 *  vocab and reading-session — the ONLY thing that genuinely differs between the
 *  public-library reader and the user-uploaded-book reader. */
export type ReaderSource =
  | { kind: 'edition'; id: string | null; idRef: MutableRefObject<string | null> }
  | { kind: 'userbook'; id: string | null; idRef: MutableRefObject<string | null> }

/** A loaded chapter, normalised across both data sources. */
export interface ReaderShellChapter {
  id: string
  title: string
  html: string
  prev?: { slug: string } | null
  next?: { slug: string } | null
}

export interface ReaderShellProps {
  source: ReaderSource
  /** Owned by the route (so its data hooks can inject too); attached to the WebView here. */
  webViewRef: RefObject<WebView | null>
  injectJs: (js: string) => void

  /** A loaded chapter — the route handles loading/error and only renders the shell once ready. */
  chapter: ReaderShellChapter
  /** URL slug of the current chapter. */
  chapterSlug: string
  /** 3rd arg to buildReaderHtml (chapter slug baked into 'progress' messages).
   *  Public passes its chapterSlug; user-book historically passed undefined. */
  htmlChapterSlug?: string
  bookTitle: string | null
  chapters: { slug: string; title: string; chapterNumber?: number; wordCount?: number | null; sourceStartPage?: number | null }[]
  chaptersLoading: boolean

  // Progress/session machinery — refs created by the route (its progress + session
  // hooks read them); mutated here from the WebView 'progress' message.
  progressRef: MutableRefObject<number>
  scrollOffsetRef: MutableRefObject<number>
  currentChapterSlugRef: MutableRefObject<string | null>
  bookProgressRef: MutableRefObject<number | null>
  totalWordCountRef: MutableRefObject<number>
  bumpProgress: () => void
  saveProgress: () => void

  /** Signalled once the WebView finishes loading. The shared persistence
   *  layer gates scroll-restore on this + the async saved-position fetch, so
   *  restore can't race the load (the "always returns to top" bug). */
  onWebViewLoaded: () => void

  // Infinite scroll — the per-source fetch lives in the route; these fire on the
  // WebView 'loaded' / 'requestNextChapter' messages.
  onChapterLoaded: () => void
  onRequestNextChapter: () => void

  /** Perform the actual router.replace to a chapter slug (path differs per source). */
  onNavigateChapter: (slug: string) => void

  // Bookmarks (state + mutations owned by the route; locator→slug mapping differs).
  // "is the ACTIVE chapter bookmarked" is computed here since activeSlug lives here.
  bookmarks: BookmarkDto[]
  onToggleCurrentBookmark: (slug: string) => void
  onDeleteBookmark: (id: string) => void
  bookmarkChapterSlug: (b: BookmarkDto) => string

  /** Book title ref (vocab-save payload). */
  bookTitleRef: MutableRefObject<string | null>
  /** Word count of the loaded chapter (reading-session input). */
  wordCount: number
  /** Explain sheet "bookId" — editionId for public, undefined for user-book. */
  explainBookId?: string
  /** "Ask this book" target — catalog edition OR user-uploaded book (AI-027 P2).
   *  Drives the Ask button visibility and which endpoint family the sheet hits. */
  askTarget?: AskTarget

  /** ADR-012 S4b — render the ORIGINAL PDF (pdf.js viewer) instead of the reflow
   *  HTML. Same shell, one branch: the WebView source swaps and the reflow-only
   *  scroll/progress/infinite-scroll message branches go inert. */
  original?: boolean
  /** Range-enabled URL of the original PDF (Bearer injected into pdf.js, not the URL). */
  originalFileUrl?: string | null
  /** 1-based page to open the PDF at (chapter start page). Wins over the server
   *  resume page. Null → use the server resume page, else page 1. */
  originalInitialPage?: number | null
  /** Server-persisted resume page (parsed from the `page:<N>` locator). Used
   *  when the chapter carries no page. (ADR-012 S4c) */
  originalResumePage?: number | null
  /** False while the server resume page is still loading — the initial jump waits
   *  on this (ignored when `originalInitialPage` is set). */
  originalResumeReady?: boolean
  /** Persist a PDF page position to server progress (debounced by the source).
   *  Never feeds the word-based reading session. */
  persistPdfPage?: (page: number, numPages: number) => void
  /** Toggle a page bookmark for the current PDF page (original mode). */
  onTogglePageBookmark?: (page: number) => void
  /** Whether a given 1-based page has a page bookmark. */
  isPageBookmarked?: (page: number) => boolean
  /** Drop into the reflow reader on a corrupt PDF. Undefined when no reflow
   *  chapters exist (→ hard error). */
  onForceReflow?: () => void
}

/**
 * The shared reader body for BOTH the public-library reader and the user-uploaded
 * book reader. Owns the WebView and every WebView-coupled concern — vocab underline +
 * inline-translation gloss, highlights, text selection, immersive bars, top bar,
 * footer, sheets, scroll restore and the 'progress'/'selection'/'highlightTap' message
 * routing. The two routes stay thin: they load their source-specific data (chapter,
 * chapter list, bookmarks, progress, reading session, infinite scroll) and hand the
 * results + a `source` discriminator down here. This is the single place the reader
 * UX lives, so a fix lands in both catalogs at once (was: copy-pasted + drifted).
 */
export function ReaderShell(props: ReaderShellProps) {
  const {
    source, webViewRef, injectJs, chapter, chapterSlug, htmlChapterSlug,
    bookTitle, chapters, chaptersLoading,
    progressRef, scrollOffsetRef, currentChapterSlugRef, bookProgressRef, totalWordCountRef,
    bumpProgress, saveProgress,
    onWebViewLoaded,
    onChapterLoaded, onRequestNextChapter, onNavigateChapter,
    bookmarks, onToggleCurrentBookmark, onDeleteBookmark, bookmarkChapterSlug,
    bookTitleRef, wordCount, explainBookId, askTarget,
    original, originalFileUrl, originalInitialPage,
    originalResumePage, originalResumeReady, persistPdfPage,
    onTogglePageBookmark, isPageBookmarked, onForceReflow,
  } = props

  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const overlayV2 = useReaderOverlayV2Active()
  const { colors } = useTheme()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const { toggle: toggleTts, isSpeaking } = useTts()
  const quickStats = useQuickStats(isAuthenticated)
  const haptics = useHaptics()
  const { show: showToast } = useToast()
  const insets = useSafeAreaInsets()
  // Gated on a real chapter, so an error overlay or a failed load lets the
  // phone sleep as usual.
  useKeepReaderAwake(!!chapter)
  const wpm = useReadingPace(!!chapter && !original)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  /** Passage attached to the Ask sheet via the selection toolbar's "Ask about this" action. */
  const [askPrefill, setAskPrefill] = useState<AskPrefill | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bookProgress, setBookProgress] = useState<number | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  const sessionWordCountRef = useRef(0)

  // --- ADR-012 S4b: Original-layout PDF viewer state ------------------------
  // The Bearer token is fetched once and injected into pdf.js httpHeaders via
  // the viewer HTML. On a mid-read Range 401 the WebView posts `pdfAuthExpired`
  // → we refresh (shared single-flight) and rebuild the source (nonce bump)
  // restoring the current page — no visible banner (mobile UX).
  const [pdfToken, setPdfToken] = useState<string | null>(null)
  const [pdfTokenReady, setPdfTokenReady] = useState(false)
  const [pdfReloadNonce, setPdfReloadNonce] = useState(0)
  const currentPdfPageRef = useRef<number | null>(null)
  const pdfInitialPageRef = useRef<number | null>(originalInitialPage ?? null)
  // S4c — top-visible page + page count for the PDF chrome + page-bookmark
  // state. Kept in React state (not just the ref) so the chrome + bookmark icon
  // re-render as the user scrolls.
  const [pdfCurrentPage, setPdfCurrentPage] = useState(originalInitialPage ?? 1)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  // S4c — corrupt / unreadable PDF surfaced by the viewer (pdfLoadError).
  const [pdfError, setPdfError] = useState(false)
  const pdfReadyRef = useRef(false)
  const pdfInitialJumpDoneRef = useRef(false)

  useEffect(() => {
    if (!original) return
    let cancelled = false
    getAccessToken().then(tok => {
      if (cancelled) return
      setPdfToken(tok)
      setPdfTokenReady(true)
    })
    return () => { cancelled = true }
  }, [original])

  const topBarHeight = 56 + insets.top
  const footerHeight = 60 + insets.bottom

  // Reading session — keyed by whichever catalog id the source carries.
  const { updateProgress: updateSessionProgress, recordActivity: recordSessionActivity, sessionStartedAt } = useReadingSession({
    editionId: source.kind === 'edition' ? source.id : null,
    userBookId: source.kind === 'userbook' ? source.id : null,
    wordCount,
    isAuthenticated,
  })

  const { barsVisible, barsAnim, topBarTranslateY, footerTranslateY, showBars, hideBars, toggleBars } = useReaderBars({
    topBarHeight,
    footerHeight,
    autoHideTrigger: true,
  })

  const {
    sessionWordCount,
    setSessionWordCount,
    exitSummary,
    exit: handleExit,
    exitToReview: handleExitReview,
    exitLater: handleExitLater,
  } = useReaderExitSummary({ router, saveProgress })

  const { vocabMapRef, flushToCache: flushVocabMap, bumpVocab } = useReaderVocabMap({
    user,
    isAuthenticated,
    chapterId: chapter.id,
    injectJs,
    bookLanguage: language,
    nativeLanguage,
  })

  const {
    selection,
    setSelection,
    wordSaved,
    lookupState,
    setLookupState,
    setWordSaved,
    openSelection,
  } = useReaderSelection({ flushVocabMap })

  const {
    highlightsRef,
    editingHighlight,
    setEditingHighlight,
    create: createHighlight,
    createPdf: createPdfHighlight,
    repaintPdf,
    saveNote: saveHighlightNote,
    updateColor: updateHighlightColor,
    remove: removeHighlight,
  } = useReaderHighlights({
    ...(source.kind === 'edition'
      ? { editionId: source.id, editionIdRef: source.idRef }
      : { userBookId: source.id, userBookIdRef: source.idRef }),
    user,
    isAuthenticated,
    chapterId: chapter.id,
    injectJs,
    showToast,
    original,
  })

  // Original PDF: the color the user picked in the toolbar, held while the
  // bundled viewer resolves the anchor for the current selection and posts
  // `pdfHighlightCreate` back. Read by the message handler at persist time.
  const pendingPdfColorRef = useRef<string>(settings.lastHighlightColor)

  const notifyWordSaved = useCallback(() => {
    sessionWordCountRef.current += 1
    const count = sessionWordCountRef.current
    haptics.play('complete')
    showToast({
      variant: 'success',
      message:
        count > 1
          ? interpolate(t(language, 'reader.toastWordAddedCount'), { count })
          : t(language, 'reader.toastWordAdded'),
      actionLabel: t(language, 'reader.toastTapToReview'),
      onPress: () => router.push('/vocabulary'),
      duration: 2400,
    })
  }, [haptics, showToast, language, router])

  const vocabActions = useReaderVocabActions({
    vocabMapRef,
    bookTitleRef,
    ...(source.kind === 'edition' ? { editionIdRef: source.idRef } : { userBookIdRef: source.idRef }),
    chapter: { id: chapter.id } as unknown as Chapter,
    language,
    nativeLanguage,
    isAuthenticated,
    injectJs,
    bumpVocab,
    notifyWordSaved,
    setSessionWordCount,
    setWordSaved,
    setSelection,
    setLookupState,
    showToast,
  })

  // Inbound bridge to the pdf.js viewer — TOC jumps, page-input jumps, and the
  // server-resume initial jump all route through `window.scrollToPage(n)`.
  const scrollPdfToPage = useCallback((page: number) => {
    injectJs(`window.scrollToPage && window.scrollToPage(${Math.max(1, Math.floor(page))})`)
  }, [injectJs])

  // Initial page resolution for the Original PDF. The chapter start page (if the
  // user opened a specific chapter) is applied by the viewer bootstrap
  // (`initialPage`), so here we only handle the SERVER resume page — and only
  // once the doc is ready AND the resume fetch has resolved. Chapter page always
  // wins (precedence: chapter sourceStartPage > server page > page 1).
  const maybeInitialPdfJump = useCallback(() => {
    if (!original || !pdfReadyRef.current || pdfInitialJumpDoneRef.current) return
    if (originalInitialPage != null) { pdfInitialJumpDoneRef.current = true; return }
    if (!originalResumeReady) return
    pdfInitialJumpDoneRef.current = true
    const target = resolveOpenPage(originalResumePage)
    if (target > 1) scrollPdfToPage(target)
  }, [original, originalInitialPage, originalResumeReady, originalResumePage, scrollPdfToPage])

  // Run the deferred initial jump once the async server resume page arrives
  // after the viewer was already ready.
  useEffect(() => { maybeInitialPdfJump() }, [maybeInitialPdfJump])

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'log') {
        if (__DEV__) {
          const fn = data.level === 'error' ? console.error : data.level === 'warn' ? console.warn : console.log
          fn('[WV]', data.msg)
        }
        return
      }
      if (data.type === 'tap') {
        toggleBars()
      } else if (data.type === 'scrollDir') {
        // Original PDF has no word-based 'progress' message, so genuine scroll
        // is the session's activity signal (time-only — never a page percent).
        if (original) recordSessionActivity()
        if (data.dir === 'up') showBars()
        else if (data.dir === 'down') hideBars()
      } else if (data.type === 'progress') {
        progressRef.current = data.progress
        if (typeof data.scrollY === 'number') scrollOffsetRef.current = data.scrollY
        setProgress(data.progress)
        updateSessionProgress(data.progress)
        if (data.chapterSlug) {
          currentChapterSlugRef.current = data.chapterSlug
          setVisibleChapterSlug(data.chapterSlug)
        }
        const activeSlugForCalc = data.chapterSlug || currentChapterSlugRef.current || chapterSlug || null
        const bp = computeBookProgress(chapters, activeSlugForCalc, data.progress, totalWordCountRef.current)
        bookProgressRef.current = bp
        setBookProgress(bp)
        bumpProgress()
      } else if (data.type === 'loaded') {
        onChapterLoaded()
      } else if (data.type === 'requestNextChapter') {
        onRequestNextChapter()
      } else if (data.type === 'highlightTap') {
        const hl = highlightsRef.current.find(h => h.id === data.highlightId)
        if (hl) setEditingHighlight(hl)
      } else if (data.type === 'wordEngage') {
        // Word resolved via deliberate long-press (Item A). Light selection
        // impact confirms the hold registered before the WordCard opens.
        haptics.play('flip')
      } else if (data.type === 'selection') {
        const mode: 'tap' | 'drag' = data.mode === 'tap' ? 'tap' : 'drag'
        const nextId = openSelection(data.text ? { ...data, mode } : null)
        if (nextId !== null && !data.text.includes(' ')) {
          toggleTts(data.text, { rate: settings.ttsSpeed, lang: language })
        }
      } else if (data.type === 'pdfHighlightCreate') {
        // Original PDF: the viewer resolved a quad-rect anchor for the current
        // selection. Persist it (chapterless userbook highlight) with the color
        // the user picked in the toolbar; the hook re-pushes the set to repaint.
        const anchor = data.anchor
        if (anchor && Array.isArray(anchor.rects) && anchor.rects.length > 0) {
          void createPdfHighlight({ color: pendingPdfColorRef.current, anchor, selectedText: anchor.exact || '' })
        }
      } else if (data.type === 'pdfReady') {
        // Document opened — record page count, clear any prior error, and run
        // the deferred server-resume initial jump if the fetch already resolved.
        if (typeof data.numPages === 'number') setPdfNumPages(data.numPages)
        pdfReadyRef.current = true
        setPdfError(false)
        maybeInitialPdfJump()
        // Viewer is up — (re)push any highlights loaded before it was ready.
        repaintPdf()
      } else if (data.type === 'pdfPage') {
        // Top-visible page (throttled). Track it (auth-expired reload restore +
        // chrome + page-bookmark state), persist page-based progress (debounced,
        // NOT word-based), and keep the reading session alive on time.
        if (typeof data.page === 'number') {
          currentPdfPageRef.current = data.page
          setPdfCurrentPage(data.page)
          recordSessionActivity()
          if (typeof data.numPages === 'number') {
            setPdfNumPages(data.numPages)
            // Gate persistence until the initial (chapter/server-resume) jump has
            // settled — otherwise a transient page-1 report during a slow server
            // resume fetch could overwrite the saved page.
            if (pdfInitialJumpDoneRef.current) persistPdfPage?.(data.page, data.numPages)
          }
        }
      } else if (data.type === 'pdfAuthExpired') {
        // Silent recovery: remember the page, refresh the token (shared
        // single-flight), then rebuild the viewer source with the fresh token.
        pdfInitialPageRef.current = currentPdfPageRef.current ?? pdfInitialPageRef.current
        onUnauthorized().then(tok => {
          if (tok) {
            setPdfToken(tok)
            setPdfReloadNonce(n => n + 1)
          }
        })
      } else if (data.type === 'pdfLoadError') {
        // Corrupt / unreadable PDF (NOT the 401 reload path). Surface the reader
        // error state → "open as text" (if reflow chapters exist) or hard error.
        if (__DEV__) console.warn('[reader] pdf load error:', data.message)
        setPdfError(true)
      }
    } catch (err) {
      if (__DEV__) console.warn('[reader] postMessage handler threw', err, event?.nativeEvent?.data)
    }
  }, [chapters, chapterSlug, language, settings.ttsSpeed, toggleTts, toggleBars, showBars, hideBars,
      setEditingHighlight, updateSessionProgress, onChapterLoaded, onRequestNextChapter, openSelection, bumpProgress, haptics,
      original, recordSessionActivity, maybeInitialPdfJump, persistPdfPage, createPdfHighlight, repaintPdf])

  // "12 min left in chapter" — the estimate Kindle readers reach for, using the
  // per-user pace the server already derives from real sessions. Rendered only
  // when the book carries word counts; a fabricated number is worse than none.
  // Reflow only: the PDF path has pages, not words.
  const timeLeftLabel = (() => {
    if (original || !settings.showReaderStats) return null
    const est = estimateTimeLeft(chapters, visibleChapterSlug || chapterSlug, progress, wpm)
    if (!est) return null
    return formatMinutesLeft(est.chapterMinutes, {
      under: t(language, 'reader.timeLeft.under'),
      minutes: t(language, 'reader.timeLeft.minutes'),
      hours: t(language, 'reader.timeLeft.hours'),
      hoursMinutes: t(language, 'reader.timeLeft.hoursMinutes'),
    })
  })()

  const navigateChapter = (slug: string) => {
    saveProgress()
    progressRef.current = 0
    scrollOffsetRef.current = 0
    setProgress(0)
    if (chapters.length > 0) {
      const bp = computeBookProgress(chapters, slug, 0, totalWordCountRef.current)
      bookProgressRef.current = bp
      setBookProgress(bp)
    }
    onNavigateChapter(slug)
  }

  // RAG citation (AI-026d): scroll the WebView to the cited passage.
  const pendingCitationRef = useRef<{ slug: string; snippet: string; charStart: number } | null>(null)
  const scrollToCitation = (snippet: string, charStart: number) =>
    injectJs(`window.__textstackScrollToCitation && window.__textstackScrollToCitation(${JSON.stringify(snippet)}, ${charStart})`)

  // M2: scroll the reflow WebView to a saved highlight (no chapter navigation →
  // reading position preserved). The Highlights sheet's list is always the
  // current chapter, so the anchor resolves in the live DOM.
  const scrollToHighlight = (anchorJson: string) =>
    injectJs(`window.__textstackScrollToHighlight && window.__textstackScrollToHighlight(${JSON.stringify(anchorJson)})`)

  const activeSlug = visibleChapterSlug ?? chapterSlug
  // Same chapter → scroll now; other chapter → navigate, then onLoadEnd injects once it renders.
  const handleCitation = (c: AskCitation) => {
    const slug = citationChapterSlug(chapters, c.chapterOrd)
    if (!slug) return
    const snippet = makeSnippet(c.preview)
    if (slug === activeSlug) {
      scrollToCitation(snippet, c.charStart)
    } else {
      pendingCitationRef.current = { slug, snippet, charStart: c.charStart }
      navigateChapter(slug)
    }
  }
  const activeChapter = chapters.find(c => c.slug === activeSlug)
  // Original PDF: the "current" bookmark is the top-visible PAGE, not a chapter.
  const isCurrentBookmarked = original
    ? (isPageBookmarked?.(pdfCurrentPage) ?? false)
    : bookmarks.some(b => bookmarkChapterSlug(b) === activeSlug)

  // TOC selection: original mode scrolls the PDF to the chapter's start page
  // instead of routing to a chapter (mirrors web ReaderPage onChapterSelect).
  const handleTocSelect = (slug: string) => {
    if (original) {
      const ch = chapters.find(c => c.slug === slug)
      scrollPdfToPage(ch?.sourceStartPage ?? 1)
      return
    }
    navigateChapter(slug)
  }

  // Bookmark toggle target differs by mode: current PDF page vs active chapter.
  const toggleCurrentBookmark = () => {
    if (original) onTogglePageBookmark?.(pdfCurrentPage)
    else onToggleCurrentBookmark(activeSlug)
  }
  const isMultiWord = !!(selection && selection.mode === 'drag' && selection.text.includes(' '))
  const currentChapterIndex = chapters.findIndex(c => c.slug === activeSlug)
  const totalChapters = chapters.length

  const handleSaveWord = () => selection ? vocabActions.saveWord(selection) : undefined
  const handleMarkKnown = () => selection ? vocabActions.markKnown(selection) : undefined
  const handleRemoveWord = () => selection ? vocabActions.removeWord(selection) : undefined

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return
    if (color === 'yellow' || color === 'green' || color === 'pink' || color === 'blue') {
      updateSettings({ lastHighlightColor: color })
    }
    // Original PDF: RN can't reach the WebView's DOM Range, so the bundled
    // viewer resolves the quad-rect anchor from the live selection and posts
    // `pdfHighlightCreate` back (mirrors web computePdfAnchorFromRange at commit
    // time). Stash the color; the message handler persists with it.
    if (original) {
      pendingPdfColorRef.current = color
      injectJs('window.__pdfCreateHighlight && window.__pdfCreateHighlight()')
      setSelection(null)
      return
    }
    await createHighlight({ color, selection, chapter: { id: chapter.id } })
    setSelection(null)
  }, [selection, chapter.id, createHighlight, updateSettings, original, injectJs])

  // Sync inline translations setting to the WebView — was missing on the
  // user-book reader, so the gloss never showed there (now shared). Skipped in
  // the PDF viewer (no reflow vocab layer to toggle — S5 paints over the PDF).
  useEffect(() => {
    if (original) return
    injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
  }, [settings.showInlineTranslations, injectJs, original])

  // Recompute book-wide progress once chapters/wordCount land — early
  // 'progress' messages fire before the chapter list resolves.
  useEffect(() => {
    if (chapters.length === 0) return
    const slug = currentChapterSlugRef.current || chapterSlug || null
    const bp = computeBookProgress(chapters, slug, progressRef.current, totalWordCountRef.current)
    bookProgressRef.current = bp
    setBookProgress(bp)
  }, [chapters, chapterSlug])

  const html = useMemo(
    () => buildReaderHtml(chapter.html, {
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      fontFamily: resolvedFontFamily,
      textAlign: settings.textAlign,
      backgroundColor: resolvedTheme.backgroundColor,
      textColor: resolvedTheme.textColor,
    }, htmlChapterSlug, { top: insets.top, bottom: insets.bottom }, { overlayV2 }),
    [chapter.html, settings.fontSize, settings.lineHeight, resolvedFontFamily, settings.textAlign,
     resolvedTheme.backgroundColor, resolvedTheme.textColor, htmlChapterSlug, insets.top, insets.bottom, overlayV2],
  )

  // ADR-012 S4b — the Original-layout PDF document. Rebuilt when the token
  // refreshes (nonce) so a silent 401 recovery reloads at the tracked page.
  const pdfHtml = useMemo(() => {
    if (!original || !originalFileUrl) return ''
    return buildPdfViewerHtml(originalFileUrl, pdfToken, {
      theme: {
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontFamily: resolvedFontFamily,
        textAlign: settings.textAlign,
        backgroundColor: resolvedTheme.backgroundColor,
        textColor: resolvedTheme.textColor,
      },
      initialPage: pdfInitialPageRef.current ?? originalInitialPage ?? null,
      safeArea: { top: insets.top, bottom: insets.bottom },
    })
    // pdfReloadNonce intentionally in deps — it forces a rebuild on token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, originalFileUrl, pdfToken, pdfReloadNonce, originalInitialPage,
      resolvedTheme.backgroundColor, resolvedTheme.textColor, insets.top, insets.bottom])

  // baseUrl = API origin so pdf.js lazy Range requests are same-origin (the
  // Bearer travels in httpHeaders, no CORS preflight). Reflow uses inline html.
  const webViewSource = useMemo(() => {
    if (original) {
      if (!pdfTokenReady) {
        return { html: `<!DOCTYPE html><html><body style="background:${resolvedTheme.backgroundColor};margin:0"></body></html>` }
      }
      return { html: pdfHtml, baseUrl: API_URL }
    }
    return { html }
  }, [original, pdfTokenReady, pdfHtml, html, resolvedTheme.backgroundColor])

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!barsVisible} style={settings.theme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: barBg }]}>
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          onLoadEnd={() => {
            // PDF viewer: reflow injections (vocab marks / inline-translation
            // toggle / scroll-restore) don't apply — the pdf.js controller owns
            // render + initial page. Persistent highlights DO paint over the
            // PDF text layer: re-push the set now that the (possibly reloaded)
            // document is up. pdfReady also re-pushes once pdf.js opens the doc.
            if (original) { repaintPdf(); return }
            for (const h of highlightsRef.current) {
              injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
            }
            if (Object.keys(vocabMapRef.current).length > 0) {
              injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
            }
            injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
            // Scroll-restore is owned by useReaderPersistence — it coordinates
            // this signal with the async saved-position fetch (no race).
            onWebViewLoaded()
            // A cross-chapter citation jump (AI-026d): once the cited chapter has rendered, scroll
            // to the passage — after restore (delay) so the explicit jump wins.
            const pc = pendingCitationRef.current
            if (pc && pc.slug === activeSlug) {
              pendingCitationRef.current = null
              setTimeout(() => scrollToCitation(pc.snippet, pc.charStart), 120)
            }
          }}
          originWhitelist={['*']}
          // Android's WebView ignores the viewport's user-scalable unless the
          // built-in zoom is enabled; the on-screen +/- controls are suppressed
          // so only the pinch gesture is exposed. PDF only — see the viewport
          // comment in buildPdfViewerHtml.
          setBuiltInZoomControls={original}
          setDisplayZoomControls={false}
          scrollEnabled
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
          overScrollMode="never"
          bounces={false}
          menuItems={[]}
          cacheEnabled={false}
          onShouldStartLoadWithRequest={(req) => {
            const { url, navigationType } = req
            if (url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) return true
            // PDF viewer: permit the same-origin base document load (baseUrl =
            // API origin) so pdf.js can stream lazy Range requests. Not a click.
            if (original && navigationType !== 'click' && url.startsWith(API_URL)) return true
            if (navigationType === 'click' && (url.startsWith('http://') || url.startsWith('https://'))) {
              Linking.openURL(url).catch(() => {})
              return false
            }
            return false
          }}
        />

        <ReaderTopBar
          barBg={barBg}
          barText={barText}
          barsAnim={barsAnim}
          topBarTranslateY={topBarTranslateY}
          barsVisible={barsVisible}
          topInset={insets.top}
          bookTitle={bookTitle ?? ''}
          chapterTitle={activeChapter?.title ?? chapter.title}
          sessionWordCount={sessionWordCount}
          isAuthenticated={isAuthenticated}
          hasChapters={chapters.length > 0}
          showAsk={!!askTarget}
          isCurrentBookmarked={isCurrentBookmarked}
          onExit={handleExit}
          onAskPress={() => setAskOpen(true)}
          onBookmarksPress={() => setBookmarksOpen(true)}
          onHighlightsPress={() => setHighlightsOpen(true)}
          onTocPress={() => setTocOpen(true)}
          onSettingsPress={() => setSettingsOpen(true)}
        />

        {selection && (
          <SelectionActionBar
            selectedText={selection.text}
            isMultiWord={isMultiWord}
            language={language}
            onTranslate={() => setTranslateOpen(true)}
            onExplain={() => setExplainOpen(true)}
            onSpeak={() => toggleTts(selection.text, { rate: settings.ttsSpeed, lang: language })}
            onSaveWord={handleSaveWord}
            onHighlight={handleHighlight}
            highlightColor={settings.lastHighlightColor}
            onMarkKnown={handleMarkKnown}
            onRemove={handleRemoveWord}
            isSpeaking={isSpeaking}
            wordSaved={wordSaved}
            vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
            isAuthenticated={isAuthenticated}
            bottomOffset={footerHeight}
            onAskAbout={askTarget && selection.text.trim() ? () => {
              setAskPrefill({ text: selection.text.trim(), nonce: Date.now() })
              setAskOpen(true)
              injectJs('try{window.getSelection&&window.getSelection().removeAllRanges()}catch(e){}')
              setSelection(null)
            } : undefined}
            onClose={() => {
              injectJs('try{window.getSelection&&window.getSelection().removeAllRanges()}catch(e){}')
              setSelection(null)
            }}
          />
        )}

        {original ? (
          <PdfReaderChrome
            barBg={barBg}
            barText={barText}
            borderColor={barText + '15'}
            barsAnim={barsAnim}
            footerTranslateY={footerTranslateY}
            barsVisible={barsVisible}
            bottomInset={insets.bottom}
            currentPage={pdfCurrentPage}
            numPages={pdfNumPages}
            onJumpToPage={scrollPdfToPage}
          />
        ) : (
        <Animated.View style={[styles.footer, { backgroundColor: barBg, borderTopColor: barText + '15', paddingBottom: insets.bottom, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${bookProgress != null ? Math.round(bookProgress * 100) : 0}%`, backgroundColor: barText + '40' }]} />
          </View>
          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={() => chapter.prev && navigateChapter(chapter.prev.slug)}
              disabled={!chapter.prev}
              style={styles.chevronBtn}
              accessibilityLabel="Previous chapter"
              accessibilityRole="button"
            >
              <Text style={[styles.chevron, { color: barText + (chapter.prev ? 'CC' : '40') }]}>‹</Text>
            </TouchableOpacity>

            <View style={styles.footerInfo}>
              <Text style={[styles.footerChapter, { color: barText }]} numberOfLines={1}>
                {activeChapter?.title ?? chapter.title ?? ''}
              </Text>
              <View style={styles.footerMeta}>
                {totalChapters > 1 && currentChapterIndex >= 0 && (
                  <Text style={[styles.footerCounter, { color: barText + '99' }]}>
                    {currentChapterIndex + 1} / {totalChapters}
                  </Text>
                )}
                <Text style={[styles.footerPercent, { color: barText + '99' }]}>
                  {bookProgress != null ? `${Math.round(bookProgress * 100)}%` : '—'}
                </Text>
              </View>
              {timeLeftLabel ? (
                <Text style={[styles.footerTimeLeft, { color: barText + '99' }]} numberOfLines={1}>
                  {timeLeftLabel}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={() => chapter.next && navigateChapter(chapter.next.slug)}
              disabled={!chapter.next}
              style={styles.chevronBtn}
              accessibilityLabel="Next chapter"
              accessibilityRole="button"
            >
              <Text style={[styles.chevron, { color: barText + (chapter.next ? 'CC' : '40') }]}>›</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        )}

        <ReaderTapCoachmark />

        {settings.showReaderStats && isAuthenticated && quickStats && barsVisible && (
          <ReaderStatsWidget
            sessionStartedAt={sessionStartedAt}
            todaySeconds={quickStats.todaySeconds}
            dailyGoalMinutes={quickStats.dailyGoalMinutes}
          />
        )}

        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />

        <BookmarksSheet
          visible={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          bookmarks={bookmarks}
          currentChapterSlug={activeSlug || ''}
          onNavigate={navigateChapter}
          onNavigatePage={scrollPdfToPage}
          onDelete={onDeleteBookmark}
          onToggleCurrent={toggleCurrentBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
          original={original}
        />

        <HighlightsSheet
          visible={highlightsOpen}
          onClose={() => setHighlightsOpen(false)}
          highlights={highlightsRef.current}
          currentChapterSlug={activeSlug || ''}
          onNavigate={navigateChapter}
          onScrollToHighlight={scrollToHighlight}
          onNavigatePage={scrollPdfToPage}
        />

        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(txt) => toggleTts(txt, { rate: settings.ttsSpeed, lang: language })}
          fromLang={language}
        />

        <ExplanationSheet
          visible={explainOpen}
          word={selection?.text || ''}
          sentence={selection?.sentence || selection?.text || ''}
          bookId={explainBookId}
          fromLang={language}
          onClose={() => setExplainOpen(false)}
        />

        {askTarget && (
          <AskSheet
            visible={askOpen}
            target={askTarget}
            currentChapterId={chapter.id}
            prefill={askPrefill}
            isAuthenticated={isAuthenticated}
            onCitation={handleCitation}
            onSignIn={() => { setAskOpen(false); router.push('/(auth)/login') }}
            onClose={() => { setAskOpen(false); setAskPrefill(null) }}
          />
        )}

        <TocSheet
          visible={tocOpen}
          chapters={chapters.map(c => ({ slug: c.slug, title: c.title, chapterNumber: c.chapterNumber }))}
          currentChapterSlug={activeSlug || ''}
          bookmarks={bookmarks.map(b => ({ chapterSlug: bookmarkChapterSlug(b), title: b.title || undefined }))}
          onNavigate={handleTocSelect}
          onClose={() => setTocOpen(false)}
          loading={chaptersLoading}
        />

        <HighlightNoteModal
          visible={!!editingHighlight}
          snippet={editingHighlight
            ? editingHighlight.selectedText.substring(0, 120) + (editingHighlight.selectedText.length > 120 ? '…' : '')
            : ''}
          initialNote={editingHighlight?.noteText || ''}
          initialColor={(editingHighlight?.color ?? settings.lastHighlightColor) as 'yellow' | 'green' | 'pink' | 'blue'}
          onCancel={() => setEditingHighlight(null)}
          onSave={async (note) => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (hl) await saveHighlightNote(hl.id, note)
          }}
          onColorChange={async (color) => {
            const hl = editingHighlight
            if (!hl) return
            updateSettings({ lastHighlightColor: color })
            await updateHighlightColor(hl.id, color)
          }}
          onDelete={async () => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (hl) await removeHighlight(hl.id)
          }}
        />

        {original && pdfError && (
          <View style={[styles.pdfErrorOverlay, { backgroundColor: resolvedTheme.backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <Ionicons name="alert-circle-outline" size={48} color={barText + '99'} />
            <Text style={[styles.pdfErrorTitle, { color: barText }]}>Couldn't open this PDF</Text>
            <Text style={[styles.pdfErrorBody, { color: barText + '99' }]}>
              {onForceReflow
                ? 'The original file could not be displayed. You can read the extracted text version instead.'
                : 'The original file could not be displayed, and there is no text version to fall back to.'}
            </Text>
            <TouchableOpacity
              style={[styles.pdfErrorBtn, { backgroundColor: colors.primary }]}
              onPress={() => { if (onForceReflow) { setPdfError(false); onForceReflow() } else { handleExit() } }}
              accessibilityRole="button"
              accessibilityLabel={onForceReflow ? 'Read as text' : 'Go back'}
            >
              <Text style={styles.pdfErrorBtnText}>{onForceReflow ? 'Read as text' : 'Go back'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {exitSummary && (
          <View style={styles.exitSummaryOverlay}>
            {/* Follows the READER theme (barBg/barText), not the app theme — this
                card sits over the page the user was just reading, and a white card
                over a dark chapter is a flashbang. The "Later" button used to be
                white-on-white here: rgba(255,255,255,0.15) fill under #fff text. */}
            <View style={[styles.exitSummaryCard, { backgroundColor: barBg }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={[styles.exitSummaryText, { color: barText }]}>
                {sessionWordCount} word{sessionWordCount === 1 ? '' : 's'} saved
              </Text>
              <View style={styles.exitSummaryButtons}>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleExitReview}
                >
                  <Text style={[styles.exitSummaryBtnText, { color: '#fff' }]}>Review Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: barText + '15' }]}
                  onPress={handleExitLater}
                >
                  <Text style={[styles.exitSummaryBtnText, { color: barText }]}>Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, minHeight: 48 },
  chevronBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  chevron: { fontSize: 28, fontFamily: fonts.sans, lineHeight: 28 },
  footerInfo: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  footerChapter: { fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: '500' as const, textAlign: 'center' },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  footerCounter: { fontSize: 11, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  footerTimeLeft: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
  footerPercent: { fontSize: 11, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  progressBar: { height: 4, borderRadius: 0 },
  progressFill: { height: 4, borderRadius: 0 },
  pdfErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 150,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  pdfErrorTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 12, textAlign: 'center' },
  pdfErrorBody: { fontFamily: fonts.sans, fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 20 },
  pdfErrorBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  pdfErrorBtnText: { fontFamily: fonts.sansMedium, fontSize: 15, color: '#fff' },
  exitSummaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  exitSummaryCard: {
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  exitSummaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
  },
  exitSummaryButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  exitSummaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  exitSummaryBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
})
