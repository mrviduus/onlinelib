import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { t, readingProgressApi } from '@textstack/shared'
import { buildReaderHtml } from '../../../src/lib/readerHtml'
import { getLocalProgress } from '../../../src/lib/progressStorage'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderSettings } from '../../../src/hooks/useReaderSettings'
import { useReaderBars } from '../../../src/hooks/useReaderBars'
import { useReaderBookmarks, getSlugFromLocator } from '../../../src/hooks/useReaderBookmarks'
import { useReaderExitSummary } from '../../../src/hooks/useReaderExitSummary'
import { useReaderHighlights } from '../../../src/hooks/useReaderHighlights'
import { useReaderVocabMap } from '../../../src/hooks/useReaderVocabMap'
import { useReaderProgress } from '../../../src/hooks/useReaderProgress'
import { useReaderVocabActions } from '../../../src/hooks/useReaderVocabActions'
import { useReaderSelection } from '../../../src/hooks/useReaderSelection'
import { useReaderChapter } from '../../../src/hooks/useReaderChapter'
import { useReaderBook } from '../../../src/hooks/useReaderBook'
import { useReaderInfiniteScroll } from '../../../src/hooks/useReaderInfiniteScroll'
import { ReaderSettingsDrawer } from '../../../src/components/ReaderSettingsDrawer'
import { BookmarksSheet } from '../../../src/components/BookmarksSheet'
import { SelectionActionBar } from '../../../src/components/SelectionActionBar'
import { WordCard } from '../../../src/components/WordCard'
import { TranslationSheet } from '../../../src/components/TranslationSheet'
import { ExplanationSheet } from '../../../src/components/ExplanationSheet'
import { HighlightNoteModal } from '../../../src/components/HighlightNoteModal'
import { TocSheet } from '../../../src/components/TocSheet'
import { ReaderStatsWidget } from '../../../src/components/ReaderStatsWidget'
import { ReaderTapCoachmark } from '../../../src/components/reader/ReaderTapCoachmark'
import { ReaderTopBar } from '../../../src/components/reader/ReaderTopBar'
import { useReadingSession } from '../../../src/hooks/useReadingSession'
import { useReaderOverlayV2Active } from '../../../src/hooks/useReaderOverlayV2Active'
import { useTts } from '../../../src/hooks/useTts'
import { useQuickStats } from '../../../src/hooks/useQuickStats'
import { useHaptics } from '../../../src/hooks/useHaptics'
import { useToast } from '../../../src/context/ToastContext'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../src/context/ThemeContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { useNativeLanguage } from '../../../src/context/NativeLanguageContext'
import { fonts } from '../../../src/theme/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

/** Lightweight {key} interpolation — shared `t()` returns raw keys, we fill them in here. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export default function ReaderScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const overlayV2 = useReaderOverlayV2Active()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const { toggle: toggleTts, isSpeaking } = useTts()
  const webViewRef = useRef<WebView>(null)
  // Wrap in try/catch so runtime errors in injected JS are forwarded to RN
  // via the console bridge, instead of being silently swallowed by the
  // `;true;` sentinel (diagnostics Phase 1).
  const injectJs = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`try{${js}}catch(e){console.error('[diag] injectJs failed:', e && e.message, ${JSON.stringify(js.slice(0, 80))});};true;`)
  }, [])
  const progressRef = useRef(0)
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)
  const totalWordCountRef = useRef(0)
  // Saved in-chapter position for restore on WebView load. Loaded async
  // from local AsyncStorage (server fallback for authed users) once the
  // editionId resolves. PWA-parity: web does the same in useReaderScrollSync.
  const savedPercentRef = useRef<number | null>(null)
  const restoreScrolledRef = useRef(false)

  const { colors } = useTheme()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const quickStats = useQuickStats(isAuthenticated)
  const haptics = useHaptics()
  const { show: showToast } = useToast()
  const sessionWordCountRef = useRef(0)

  const { chapter, setChapter, loading, chapterError, wordCountRef } = useReaderChapter({
    bookSlug,
    chapterSlug,
    language,
    editionIdRef,
  })

  const {
    bookmarks,
    setBookmarks,
    isBookmarked,
    toggle: toggleBookmark,
    remove: removeBookmark,
  } = useReaderBookmarks({ editionIdRef, isAuthenticated, showToast })

  // Hoisted above useReaderHighlights so its `editionId` state is available
  // — without it the highlights effect can race chapterId against editionId
  // and miss the load when chapter wins.
  const { bookTitle, chapters, editionId } = useReaderBook({
    bookSlug,
    language,
    isAuthenticated,
    editionIdRef,
    bookTitleRef,
    totalWordCountRef,
    setBookmarks,
  })

  const {
    highlightsRef,
    editingHighlight,
    setEditingHighlight,
    create: createHighlight,
    saveNote: saveHighlightNote,
    remove: removeHighlight,
  } = useReaderHighlights({
    editionId,
    editionIdRef,
    user,
    isAuthenticated,
    chapterId: chapter?.id,
    injectJs,
    showToast,
  })

  const { vocabMapRef, flushToCache: flushVocabMap } = useReaderVocabMap({
    user,
    isAuthenticated,
    chapterId: chapter?.id,
    injectJs,
  })

  const {
    selection,
    setSelection,
    wordSaved,
    setWordSaved,
    lookupState,
    setLookupState,
    autoSavedRef,
    openSelection,
  } = useReaderSelection({ flushVocabMap })

  // Single source of truth for "word added" feedback — keeps toast copy + haptic
  // cue + session counter consistent across the two save paths (auto-save on
  // single-word tap, and the manual "Save" button in SelectionActionBar).
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

  const { enableForChapter: enableInfiniteScrollFor, loadNext: loadNextChapter } = useReaderInfiniteScroll({
    bookSlug,
    language,
    injectJs,
    wordCountRef,
  })
  const insets = useSafeAreaInsets()
  const topBarHeight = 56 + insets.top
  const footerHeight = 60 + insets.bottom

  // Immersive mode — auto-hide bars. Auto-hide on first chapter load gives
  // the reader chrome to orient with; after that visibility is driven by
  // scroll direction (see handleMessage 'scrollDir').
  const { barsVisible, barsAnim, topBarTranslateY, footerTranslateY, showBars, hideBars, toggleBars } = useReaderBars({
    topBarHeight,
    footerHeight,
    autoHideTrigger: !loading && !!chapter,
  })
  const currentChapterSlugRef = useRef<string | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  // Reading session tracking
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: editionIdRef.current,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  const { saveProgress } = useReaderProgress({
    editionIdRef,
    chapter,
    chapterSlug,
    currentChapterSlugRef,
    progressRef,
    isAuthenticated,
  })

  const {
    sessionWordCount,
    setSessionWordCount,
    exitSummary,
    exit: handleExit,
    exitToReview: handleExitReview,
    exitLater: handleExitLater,
  } = useReaderExitSummary({ router, saveProgress })

  const vocabActions = useReaderVocabActions({
    vocabMapRef,
    bookTitleRef,
    editionIdRef,
    chapter,
    language,
    nativeLanguage,
    isAuthenticated,
    injectJs,
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
        // ElevenReader-style reveal: scrolling back up (re-reading)
        // brings chrome back; scrolling forward hides it. Tap remains
        // as a manual toggle for discoverability.
        if (data.dir === 'up') showBars()
        else if (data.dir === 'down') hideBars()
      } else if (data.type === 'progress') {
        progressRef.current = data.progress
        setProgress(data.progress)
        updateSessionProgress(data.progress)
        if (data.chapterSlug) {
          currentChapterSlugRef.current = data.chapterSlug
          setVisibleChapterSlug(data.chapterSlug)
        }
      } else if (data.type === 'loaded') {
        enableInfiniteScrollFor(chapter)
      } else if (data.type === 'requestNextChapter') {
        loadNextChapter()
      } else if (data.type === 'highlightTap') {
        const hl = highlightsRef.current.find(h => h.id === data.highlightId)
        if (hl) setEditingHighlight(hl)
      } else if (data.type === 'selection') {
        const nextId = openSelection(data.text ? data : null)
        // Single word: auto-TTS + auto-save to vocabulary (matches web behavior)
        if (nextId !== null && !data.text.includes(' ')) {
          toggleTts(data.text, { rate: settings.ttsSpeed, lang: language })
          vocabActions.autoSaveWord(
            { text: data.text, sentence: data.sentence || '', anchor: data.anchor || null, selectionId: nextId },
            autoSavedRef,
          )
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[reader] postMessage handler threw', err, event?.nativeEvent?.data)
    }
    // Refs (highlightsRef, autoSavedRef) are read inside but intentionally
    // omitted from deps — refs don't trigger re-creation and listing them
    // here only adds noise.
  }, [chapter, language, settings.ttsSpeed, toggleTts, toggleBars, showBars, hideBars, vocabActions, setEditingHighlight, updateSessionProgress, enableInfiniteScrollFor, loadNextChapter, openSelection])

  const navigateChapter = (slug: string) => {
    saveProgress()
    router.replace(`/reader/${bookSlug}/${slug}`)
  }

  const activeSlug = visibleChapterSlug ?? chapterSlug
  // Footer/topbar reflect the chapter that's actually visible — during
  // infinite scroll the URL chapterSlug stays put while visibleChapterSlug
  // advances, so reading `chapter.title` (URL-keyed via useReaderChapter)
  // would show the wrong title and counter.
  const activeChapter = chapters.find(c => c.slug === activeSlug)
  const isCurrentBookmarked = isBookmarked(activeSlug)
  const toggleCurrentBookmark = () => {
    if (!chapter || !activeSlug) return
    return toggleBookmark({ chapter, slug: activeSlug })
  }

  const handleSaveWord = () => selection ? vocabActions.saveWord(selection) : undefined
  const handlePromoteLookup = () => lookupState ? vocabActions.promoteLookup(lookupState) : undefined
  const handleMarkKnown = () => selection ? vocabActions.markKnown(selection) : undefined
  const handleRemoveWord = () => selection ? vocabActions.removeWord(selection) : undefined

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection || !chapter) return
    await createHighlight({ color, selection, chapter })
    if (__DEV__) console.log('[diag] setSelection NULL (highlight created)')
    setSelection(null)
  }, [selection, chapter, createHighlight])


  // Sync inline translations setting to WebView
  useEffect(() => {
    injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
  }, [settings.showInlineTranslations])

  // Load saved in-chapter position. Local-first (instant, offline-safe);
  // fall back to server for the cross-device case (read on web → open on
  // phone). One-shot per (editionId, chapterSlug) — guard with ref so we
  // don't re-scroll after settings tweaks rebuild the HTML.
  useEffect(() => {
    restoreScrolledRef.current = false
    savedPercentRef.current = null
    if (!editionId || !chapterSlug) return
    let cancelled = false
    ;(async () => {
      let percent: number | null = null
      try {
        const local = await getLocalProgress(editionId)
        if (local && local.chapterSlug === chapterSlug && typeof local.percent === 'number') {
          percent = local.percent
        }
      } catch {}
      if (percent == null && isAuthenticated) {
        try {
          const server = await readingProgressApi.getProgress(editionId)
          if (server && server.chapterSlug === chapterSlug && typeof server.percent === 'number') {
            percent = server.percent
          }
        } catch {}
      }
      if (cancelled) return
      // Ignore near-zero (top) and near-one (chapter end) — these add jitter
      // without any UX win.
      if (percent != null && percent > 0.005 && percent < 0.999) {
        savedPercentRef.current = percent
      }
    })()
    return () => { cancelled = true }
  }, [editionId, chapterSlug, isAuthenticated])

  const isMultiWord = !!(selection && selection.text.includes(' '))

  // Chapter counter for footer — track the visible chapter, not the URL's.
  const currentChapterIndex = chapters.findIndex(c => c.slug === activeSlug)
  const totalChapters = chapters.length

  // Large HTML string. Rebuilding every render burns CPU and — if the
  // source prop object is recreated — triggers WebView work. Memoize on
  // only the primitives the template actually reads (R-3).
  //
  // CRITICAL (B-77): these useMemo calls MUST run on every render — not
  // behind the `loading` / `!chapter` early returns below. Placing hooks
  // after early returns made React count fewer hooks on the loading frame
  // than on the loaded frame, tripping "Rendered more hooks than during
  // the previous render" and ErrorBoundary-unmounting the whole reader.
  // That cascade explained the symptoms the user reported: system Android
  // selection menu (no WebView overlay left to catch the tap), no
  // WordCard popup, and no translation.
  const html = useMemo(
    () => chapter
      ? buildReaderHtml(chapter.html, {
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          fontFamily: resolvedFontFamily,
          textAlign: settings.textAlign,
          backgroundColor: resolvedTheme.backgroundColor,
          textColor: resolvedTheme.textColor,
        }, chapterSlug, { top: insets.top, bottom: insets.bottom }, { overlayV2 })
      : '',
    [
      chapter?.html,
      settings.fontSize,
      settings.lineHeight,
      resolvedFontFamily,
      settings.textAlign,
      resolvedTheme.backgroundColor,
      resolvedTheme.textColor,
      chapterSlug,
      insets.top,
      insets.bottom,
      overlayV2,
    ],
  )
  // WebView source prop is compared shallowly; keeping the object
  // stable across renders avoids any accidental reloads on platforms
  // that key off reference.
  const webViewSource = useMemo(() => ({ html }), [html])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!chapter) {
    // `chapterError` is 'offline' when we couldn't reach the server and
    // had no cached copy, 'notfound' on a confirmed 404 (R-4).
    const isNotFound = chapterError === 'notfound'
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false }} />
        <View style={[styles.center, styles.errorWrap, { backgroundColor: colors.background }]}>
          <Ionicons
            name={isNotFound ? 'help-circle-outline' : 'cloud-offline-outline'}
            size={56}
            color={colors.textSecondary}
          />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {isNotFound ? "We couldn't find this chapter" : "This chapter isn't available offline"}
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
            {isNotFound
              ? 'The chapter may have been removed or the link is outdated.'
              : 'Download the book for offline reading, or connect to the internet and try again.'}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.primary, borderRadius: 10 }}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 15 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!barsVisible} style={settings.theme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: barBg }]}>
        {/* Reader WebView — rendered first so overlay bars sit on top */}
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          onLoadEnd={() => {
            // `html` memo rebuilds on settings change → WebView reloads → JS state wiped.
            // Re-apply highlights + vocab from refs so they survive font/theme tweaks.
            for (const h of highlightsRef.current) {
              injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
            }
            if (Object.keys(vocabMapRef.current).length > 0) {
              injectJs(`markVocabWords(${JSON.stringify(vocabMapRef.current)})`)
            }
            injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
            // Restore in-chapter position. One-shot — settings tweaks rebuild
            // the HTML and re-fire onLoadEnd, but the user's already mid-read
            // by then, so we must not yank them back.
            if (!restoreScrolledRef.current && savedPercentRef.current != null) {
              const pct = savedPercentRef.current
              restoreScrolledRef.current = true
              // rAF defers until the document has laid out — without it
              // scrollHeight on Android can still read 0 at this point.
              injectJs(`requestAnimationFrame(function(){ window.scrollTo(0, Math.round(document.documentElement.scrollHeight * ${pct})); });`)
            }
          }}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
          // Android WebView defaults to a software-rendered view layer —
          // visible jank on the reader's long scrolling content. Force a
          // hardware layer so Chromium composites the page on the GPU.
          androidLayerType="hardware"
          overScrollMode="never"
          bounces={false}
          // Suppress the native Copy/Share/Web-Search callout that
          // pops up on long-press. We already render our own
          // SelectionToolbar above the selection (Translate / Define /
          // TTS / Highlight / Save word); the native menu is just
          // visual duplication on both iOS and Android.
          menuItems={[]}
          // We build a fresh inline HTML string each chapter mount
          // and bake the overlay script into it — there is no shared
          // cached document to reuse across mounts. Skip the WebView
          // cache to sidestep Android's stale-injection risk.
          cacheEnabled={false}
          // Block navigation. The WebView loads an inline HTML string;
          // tapping a link inside the book (footnote anchor, external
          // URL, img src) would navigate the WebView, wiping our
          // injected overlay script + rendered chapter. Allow only the
          // initial document load + in-page anchors (#id).
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

        {/* Top bar — rendered after WebView so it's on top of native layer */}
        <ReaderTopBar
          barBg={barBg}
          barText={barText}
          barsAnim={barsAnim}
          topBarTranslateY={topBarTranslateY}
          barsVisible={barsVisible}
          topInset={insets.top}
          bookTitle={bookTitle}
          chapterTitle={activeChapter?.title ?? chapter.title}
          sessionWordCount={sessionWordCount}
          isAuthenticated={isAuthenticated}
          hasChapters={chapters.length > 0}
          isCurrentBookmarked={isCurrentBookmarked}
          onExit={handleExit}
          onBookmarksPress={() => setBookmarksOpen(true)}
          onTocPress={() => setTocOpen(true)}
          onSettingsPress={() => setSettingsOpen(true)}
        />

        {/* Selection: WordCard for single words, ActionBar for multi-word.
            Both are absolutely positioned above the footer via `bottomOffset`
            so they're not occluded by the progress chrome. */}
        {selection && (
          isMultiWord ? (
            <SelectionActionBar
              selectedText={selection.text}
              isMultiWord
              onTranslate={() => setTranslateOpen(true)}
              onExplain={() => setExplainOpen(true)}
              onSpeak={() => toggleTts(selection.text, { rate: settings.ttsSpeed, lang: language })}
              onSaveWord={handleSaveWord}
              onHighlight={handleHighlight}
              onMarkKnown={handleMarkKnown}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
              bottomOffset={footerHeight}
            />
          ) : (
            <WordCard
              word={selection.text}
              selectionId={selection.selectionId}
              onSave={handleSaveWord}
              onSpeak={() => toggleTts(selection.text, { rate: settings.ttsSpeed, lang: language })}
              onRemove={handleRemoveWord}
              onMarkKnown={handleMarkKnown}
              onDismiss={() => {
                if (__DEV__) console.log('[diag] WordCard onDismiss fired')
                setSelection(null); setWordSaved(false); setLookupState(null)
              }}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
              language={language}
              sessionWordCount={sessionWordCount}
              bottomOffset={footerHeight}
              lookupState={lookupState}
              onAddAnyway={handlePromoteLookup}
            />
          )
        )}

        {/* Footer — progress bar + chevrons + chapter title + counter (PWA parity) */}
        <Animated.View style={[styles.footer, { backgroundColor: barBg, borderTopColor: barText + '15', paddingBottom: insets.bottom, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barText + '40' }]} />
          </View>
          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={() => chapter?.prev && navigateChapter(chapter.prev.slug)}
              disabled={!chapter?.prev}
              style={styles.chevronBtn}
              accessibilityLabel="Previous chapter"
              accessibilityRole="button"
            >
              <Text style={[styles.chevron, { color: barText + (chapter?.prev ? 'CC' : '40') }]}>‹</Text>
            </TouchableOpacity>

            <View style={styles.footerInfo}>
              <Text style={[styles.footerChapter, { color: barText }]} numberOfLines={1}>
                {activeChapter?.title ?? chapter?.title ?? ''}
              </Text>
              <View style={styles.footerMeta}>
                {totalChapters > 1 && currentChapterIndex >= 0 && (
                  <Text style={[styles.footerCounter, { color: barText + '99' }]}>
                    {currentChapterIndex + 1} / {totalChapters}
                  </Text>
                )}
                <Text style={[styles.footerPercent, { color: barText + '99' }]}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => chapter?.next && navigateChapter(chapter.next.slug)}
              disabled={!chapter?.next}
              style={styles.chevronBtn}
              accessibilityLabel="Next chapter"
              accessibilityRole="button"
            >
              <Text style={[styles.chevron, { color: barText + (chapter?.next ? 'CC' : '40') }]}>›</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* First-run tap-to-save hint — self-gated by AsyncStorage flag */}
        <ReaderTapCoachmark />

        {/* Reading stats widget */}
        {settings.showReaderStats && isAuthenticated && quickStats && barsVisible && (
          <ReaderStatsWidget
            sessionStartedAt={sessionStartedAt}
            todaySeconds={quickStats.todaySeconds}
            dailyGoalMinutes={quickStats.dailyGoalMinutes}
          />
        )}

        {/* Settings drawer */}
        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />

        {/* Bookmarks sheet */}
        <BookmarksSheet
          visible={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          bookmarks={bookmarks}
          currentChapterSlug={activeSlug || ''}
          onNavigate={navigateChapter}
          onDelete={removeBookmark}
          onToggleCurrent={toggleCurrentBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
        />

        {/* Translation sheet */}
        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(t) => toggleTts(t, { rate: settings.ttsSpeed, lang: language })}
          fromLang={language}
        />

        {/* Explanation sheet */}
        <ExplanationSheet
          visible={explainOpen}
          word={selection?.text || ''}
          sentence={selection?.sentence || selection?.text || ''}
          bookId={editionIdRef.current || undefined}
          fromLang={language}
          onClose={() => setExplainOpen(false)}
        />

        {/* TOC sheet */}
        <TocSheet
          visible={tocOpen}
          chapters={chapters.map(c => ({ slug: c.slug, title: c.title, chapterNumber: c.chapterNumber }))}
          currentChapterSlug={activeSlug || ''}
          bookmarks={bookmarks.map(b => ({ chapterSlug: getSlugFromLocator(b.locator) }))}
          onNavigate={navigateChapter}
          onClose={() => setTocOpen(false)}
        />

        {/* Highlight note editor — Android-safe replacement for Alert.prompt */}
        <HighlightNoteModal
          visible={!!editingHighlight}
          snippet={editingHighlight
            ? editingHighlight.selectedText.substring(0, 120) + (editingHighlight.selectedText.length > 120 ? '…' : '')
            : ''}
          initialNote={editingHighlight?.noteText || ''}
          onCancel={() => setEditingHighlight(null)}
          onSave={async (note) => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (hl) await saveHighlightNote(hl.id, note)
          }}
          onDelete={async () => {
            const hl = editingHighlight
            setEditingHighlight(null)
            if (hl) await removeHighlight(hl.id)
          }}
        />

        {/* Exit summary — words saved + review prompt */}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorWrap: {
    paddingHorizontal: 32,
    gap: 6,
  },
  errorTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  container: { flex: 1 },
  webview: { flex: 1 },
  // Footer — absolute overlay, slides up on tap
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
  // Exit summary
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
