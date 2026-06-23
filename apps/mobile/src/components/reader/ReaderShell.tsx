import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { useRouter, Stack } from 'expo-router'
import { t, computeBookProgress, citationChapterSlug, makeSnippet } from '@textstack/shared'
import type { Chapter, BookmarkDto, AskCitation, AskTarget } from '@textstack/shared'
import { buildReaderHtml } from '../../lib/readerHtml'
import { useAuth } from '../../context/AuthContext'
import { useReaderSettings } from '../../hooks/useReaderSettings'
import { useReaderBars } from '../../hooks/useReaderBars'
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
import { SelectionActionBar } from '../SelectionActionBar'
import { TranslationSheet } from '../TranslationSheet'
import { ExplanationSheet } from '../ExplanationSheet'
import { AskSheet } from '../AskSheet'
import { HighlightNoteModal } from '../HighlightNoteModal'
import { TocSheet } from '../TocSheet'
import { ReaderStatsWidget } from '../ReaderStatsWidget'
import { ReaderTapCoachmark } from './ReaderTapCoachmark'
import { ReaderTopBar } from './ReaderTopBar'
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
  chapters: { slug: string; title: string; chapterNumber?: number; wordCount?: number | null }[]
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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bookProgress, setBookProgress] = useState<number | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  const sessionWordCountRef = useRef(0)

  const topBarHeight = 56 + insets.top
  const footerHeight = 60 + insets.bottom

  // Reading session — keyed by whichever catalog id the source carries.
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
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
  })

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
      } else if (data.type === 'selection') {
        const mode: 'tap' | 'drag' = data.mode === 'tap' ? 'tap' : 'drag'
        const nextId = openSelection(data.text ? { ...data, mode } : null)
        if (nextId !== null && !data.text.includes(' ')) {
          toggleTts(data.text, { rate: settings.ttsSpeed, lang: language })
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[reader] postMessage handler threw', err, event?.nativeEvent?.data)
    }
  }, [chapters, chapterSlug, language, settings.ttsSpeed, toggleTts, toggleBars, showBars, hideBars,
      setEditingHighlight, updateSessionProgress, onChapterLoaded, onRequestNextChapter, openSelection, bumpProgress])

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
  const isCurrentBookmarked = bookmarks.some(b => bookmarkChapterSlug(b) === activeSlug)
  const isMultiWord = !!(selection && selection.mode === 'drag' && selection.text.includes(' '))
  const currentChapterIndex = chapters.findIndex(c => c.slug === activeSlug)
  const totalChapters = chapters.length

  const handleSaveWord = () => selection ? vocabActions.saveWord(selection) : undefined
  const handleMarkKnown = () => selection ? vocabActions.markKnown(selection) : undefined
  const handleRemoveWord = () => selection ? vocabActions.removeWord(selection) : undefined

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return
    await createHighlight({ color, selection, chapter: { id: chapter.id } })
    if (color === 'yellow' || color === 'green' || color === 'pink' || color === 'blue') {
      updateSettings({ lastHighlightColor: color })
    }
    setSelection(null)
  }, [selection, chapter.id, createHighlight, updateSettings])

  // Sync inline translations setting to the WebView — was missing on the
  // user-book reader, so the gloss never showed there (now shared).
  useEffect(() => {
    injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
  }, [settings.showInlineTranslations, injectJs])

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
  const webViewSource = useMemo(() => ({ html }), [html])

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
            onClose={() => {
              injectJs('try{window.getSelection&&window.getSelection().removeAllRanges()}catch(e){}')
              setSelection(null)
            }}
          />
        )}

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
          onDelete={onDeleteBookmark}
          onToggleCurrent={() => onToggleCurrentBookmark(activeSlug)}
          isCurrentBookmarked={isCurrentBookmarked}
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
            isAuthenticated={isAuthenticated}
            onCitation={handleCitation}
            onSignIn={() => { setAskOpen(false); router.push('/(auth)/login') }}
            onClose={() => setAskOpen(false)}
          />
        )}

        <TocSheet
          visible={tocOpen}
          chapters={chapters.map(c => ({ slug: c.slug, title: c.title, chapterNumber: c.chapterNumber }))}
          currentChapterSlug={activeSlug || ''}
          bookmarks={bookmarks.map(b => ({ chapterSlug: bookmarkChapterSlug(b), title: b.title || undefined }))}
          onNavigate={navigateChapter}
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

        {exitSummary && (
          <View style={styles.exitSummaryOverlay}>
            <View style={styles.exitSummaryCard}>
              <Ionicons name="checkmark-circle" size={40} color="#10B981" />
              <Text style={styles.exitSummaryText}>
                {sessionWordCount} word{sessionWordCount === 1 ? '' : 's'} saved
              </Text>
              <View style={styles.exitSummaryButtons}>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: '#C4704B' }]}
                  onPress={handleExitReview}
                >
                  <Text style={styles.exitSummaryBtnText}>Review Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.exitSummaryBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                  onPress={handleExitLater}
                >
                  <Text style={styles.exitSummaryBtnText}>Later</Text>
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
  footerPercent: { fontSize: 11, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  progressBar: { height: 4, borderRadius: 0 },
  progressFill: { height: 4, borderRadius: 0 },
  exitSummaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  exitSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  exitSummaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: '#111827',
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
    color: '#fff',
  },
})
