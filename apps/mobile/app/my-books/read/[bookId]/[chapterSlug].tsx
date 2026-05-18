import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { userBooksApi, t } from '@textstack/shared'
import type { UserBookChapterDto, BookmarkDto } from '@textstack/shared'
import { buildReaderHtml } from '../../../../src/lib/readerHtml'
import { useAuth } from '../../../../src/context/AuthContext'
import { useReaderSettings } from '../../../../src/hooks/useReaderSettings'
import { useReaderSelection } from '../../../../src/hooks/useReaderSelection'
import { useReaderHighlights } from '../../../../src/hooks/useReaderHighlights'
import { useReaderVocabMap } from '../../../../src/hooks/useReaderVocabMap'
import { useReaderVocabActions } from '../../../../src/hooks/useReaderVocabActions'
import { ReaderSettingsDrawer } from '../../../../src/components/ReaderSettingsDrawer'
import { SelectionActionBar } from '../../../../src/components/SelectionActionBar'
import { TranslationSheet } from '../../../../src/components/TranslationSheet'
import { ExplanationSheet } from '../../../../src/components/ExplanationSheet'
import { HighlightNoteModal } from '../../../../src/components/HighlightNoteModal'
import { BookmarksSheet } from '../../../../src/components/BookmarksSheet'
import { TocSheet } from '../../../../src/components/TocSheet'
import { useTts } from '../../../../src/hooks/useTts'
import { useReaderOverlayV2Active } from '../../../../src/hooks/useReaderOverlayV2Active'
import { useReadingSession } from '../../../../src/hooks/useReadingSession'
import { useQuickStats } from '../../../../src/hooks/useQuickStats'
import { useHaptics } from '../../../../src/hooks/useHaptics'
import { useToast } from '../../../../src/context/ToastContext'
import { useLanguage } from '../../../../src/context/LanguageContext'
import { useNativeLanguage } from '../../../../src/context/NativeLanguageContext'
import { ReaderStatsWidget } from '../../../../src/components/ReaderStatsWidget'
import { ReaderTapCoachmark } from '../../../../src/components/reader/ReaderTapCoachmark'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../../src/context/ThemeContext'
import { fonts } from '../../../../src/theme/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { trackBookOpened } from '../../../../src/lib/analytics'

/** Lightweight {key} interpolation — shared `t()` returns raw keys. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export default function UserBookReaderScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const overlayV2 = useReaderOverlayV2Active()
  const [chapter, setChapter] = useState<UserBookChapterDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  const [chapters, setChapters] = useState<{ slug: string; title: string; chapterNumber?: number }[]>([])
  const { toggle: toggleTts, isSpeaking } = useTts()
  const { colors } = useTheme()
  const quickStats = useQuickStats(isAuthenticated)
  const haptics = useHaptics()
  const { show: showToast } = useToast()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const sessionWordCountRef = useRef(0)

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
  const insets = useSafeAreaInsets()
  const topBarHeight = 56 + insets.top
  const footerHeight = 80 + insets.bottom
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)
  // Pixel-accurate scrollY (apps/mobile/src/lib/readerHtml.ts reports it
  // in 'progress' messages). Used to build the locator + restore on mount.
  const scrollOffsetRef = useRef(0)
  // Saved offset from the previous session for one-shot restore on
  // chapter mount. null means "no saved position" — start at top.
  const savedScrollOffsetRef = useRef<number | null>(null)
  const restoreScrolledRef = useRef(false)
  // 2s debounce for in-chapter scroll saves; flushed eagerly on chapter
  // change / unmount further down.
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)
  const wordCountRef = useRef(0)
  const currentChapterSlugRef = useRef<string | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  // Sync ref so callbacks fired after a setState see the current bookId
  // (mirrors editionIdRef in the public reader). Used by shared hooks
  // below to build the per-book payload for the API.
  const userBookIdRef = useRef<string | null>(null)
  useEffect(() => { userBookIdRef.current = bookId || null }, [bookId])
  const bookTitleRef = useRef<string | null>(null)

  // Hoisted ahead of the shared hooks so they can request WebView script
  // injection (markVocabWords, renderHighlight, scroll restore).
  const injectJs = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(js + ';true;')
  }, [])

  const {
    vocabMapRef,
    flushToCache: flushVocabMap,
    bumpVocab,
  } = useReaderVocabMap({
    user,
    isAuthenticated,
    chapterId: chapter?.id,
    injectJs,
    bookLanguage: language,
    nativeLanguage,
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

  const {
    highlightsRef,
    editingHighlight,
    setEditingHighlight,
    create: createHighlight,
    saveNote: saveHighlightNote,
    updateColor: updateHighlightColor,
    remove: removeHighlight,
  } = useReaderHighlights({
    userBookId: bookId || null,
    userBookIdRef,
    user,
    isAuthenticated,
    chapterId: chapter?.id,
    injectJs,
    showToast,
  })

  const vocabActions = useReaderVocabActions({
    vocabMapRef,
    bookTitleRef,
    userBookIdRef,
    chapter: chapter ? { id: chapter.id } as unknown as Parameters<typeof useReaderVocabActions>[0]['chapter'] : null,
    language,
    nativeLanguage,
    isAuthenticated,
    injectJs,
    bumpVocab,
    notifyWordSaved: () => notifyWordSaved(),
    setSessionWordCount: () => { /* user-book uses sessionWordCountRef inline */ },
    setWordSaved,
    setSelection,
    setLookupState,
    showToast,
  })

  // Immersive mode — bars hide on scroll down, reveal on scroll up.
  // See `readerHtml.ts` for the scroll-direction detector that drives
  // the `scrollDir` message handled below.
  const [barsVisible, setBarsVisible] = useState(true)
  const barsVisibleRef = useRef(true)
  const barsAnim = useRef(new Animated.Value(1)).current
  const topBarTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [-topBarHeight, 0] })
  const footerTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [footerHeight, 0] })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideBars = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (!barsVisibleRef.current) return
    barsVisibleRef.current = false
    setBarsVisible(false)
    Animated.timing(barsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
  }, [barsAnim])

  const showBars = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (barsVisibleRef.current) return
    barsVisibleRef.current = true
    setBarsVisible(true)
    Animated.timing(barsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [barsAnim])

  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      hideBars()
    }, 3000)
  }, [hideBars])

  const toggleBars = useCallback(() => {
    if (barsVisibleRef.current) hideBars()
    else showBars()
  }, [hideBars, showBars])

  useEffect(() => { if (chapter) startHideTimer() }, [chapter, startHideTimer])

  // Clear pending hide-bars timer on unmount.
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }, [])

  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: null,
    userBookId: bookId || null,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  useEffect(() => {
    if (!bookId || !chapterSlug) return
    let cancelled = false
    setLoading(true)
    userBooksApi.getUserBookChapter(bookId, chapterSlug)
      .then(ch => {
        if (cancelled) return
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
      })
      .catch(e => {
        if (!cancelled) console.warn('Failed to load user book chapter:', e)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookId, chapterSlug])

  // Load saved scroll offset for this chapter so onLoadEnd can scroll
  // there. Public reader does the same via getLocalProgress; user-books
  // route through the server API (single source of truth).
  useEffect(() => {
    restoreScrolledRef.current = false
    savedScrollOffsetRef.current = null
    if (!bookId || !chapterSlug) return
    let cancelled = false
    userBooksApi.getUserBookProgress(bookId)
      .then(prog => {
        if (cancelled) return
        if (!prog || prog.chapterSlug !== chapterSlug) return
        if (typeof prog.locator === 'string' && prog.locator.startsWith('scroll:')) {
          const parts = prog.locator.split(':')
          const off = parseInt(parts[2], 10)
          if (parts[1] === chapterSlug && Number.isFinite(off) && off > 0) {
            savedScrollOffsetRef.current = off
          }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bookId, chapterSlug])

  // Flush the pending debounced save before chapter switches or unmount —
  // otherwise the tail end of the previous chapter's scroll is lost.
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current)
        saveDebounceRef.current = null
        if (bookId && currentChapterSlugRef.current) {
          const slug = currentChapterSlugRef.current
          userBooksApi.updateUserBookProgress(bookId, {
            percent: progressRef.current,
            chapterSlug: slug,
            locator: `scroll:${slug}:${scrollOffsetRef.current}`,
          }).catch(() => {})
        }
      }
    }
  }, [bookId, chapterSlug])

  // Load bookmarks + chapter list for TOC
  const bookOpenedFiredRef = useRef(false)
  useEffect(() => {
    if (!bookId) return
    if (!bookOpenedFiredRef.current) {
      bookOpenedFiredRef.current = true
      trackBookOpened({ source: 'userbook', userBookId: bookId })
    }
    // Failures here don't block reading — log so QA can see flaps, but
    // we intentionally don't toast (the page is functional without TOC
    // or bookmarks on first load).
    userBooksApi.getUserBookBookmarks(bookId).then(setBookmarks).catch(e => {
      console.warn('Failed to load user-book bookmarks:', e)
    })
    userBooksApi.getUserBook(bookId).then(b => {
      setChapters(b.chapters.map(ch => ({
        slug: ch.slug || `chapter-${ch.chapterNumber}`,
        title: ch.title,
        chapterNumber: ch.chapterNumber,
      })))
    }).catch(e => {
      console.warn('Failed to load user-book chapter list:', e)
    })
  }, [bookId])

  const activeSlug = visibleChapterSlug ?? chapterSlug
  const isCurrentBookmarked = bookmarks.some(b => {
    const slug = b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator
    return slug === activeSlug
  })

  const handleToggleBookmark = async () => {
    if (!bookId || !activeSlug || !chapter) return
    const existing = bookmarks.find(b => {
      const slug = b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator
      return slug === activeSlug
    })
    if (existing) {
      // Optimistic remove — restore + toast if the server rejects so the
      // UI doesn't silently lie about state (mirrors B-29 on public reader).
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
      try {
        await userBooksApi.deleteUserBookBookmark(bookId, existing.id)
      } catch (e) {
        console.warn('Delete user-book bookmark failed:', e)
        setBookmarks(prev => (prev.some(b => b.id === existing.id) ? prev : [...prev, existing]))
        showToast({ message: 'Could not remove bookmark. Try again.', variant: 'error' })
      }
    } else {
      try {
        const bm = await userBooksApi.createUserBookBookmark(bookId, {
          chapterId: chapter.id,
          locator: `chapter:${activeSlug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch (e) {
        console.warn('Create user-book bookmark failed:', e)
        showToast({ message: 'Could not add bookmark. Try again.', variant: 'error' })
      }
    }
  }

  const handleDeleteBookmark = async (bmId: string) => {
    if (!bookId) return
    const snapshot = bookmarks.find(b => b.id === bmId) ?? null
    setBookmarks(prev => prev.filter(b => b.id !== bmId))
    try {
      await userBooksApi.deleteUserBookBookmark(bookId, bmId)
    } catch (e) {
      console.warn('Delete user-book bookmark (sheet) failed:', e)
      if (snapshot) {
        setBookmarks(prev => (prev.some(b => b.id === bmId) ? prev : [...prev, snapshot]))
      }
      showToast({ message: 'Could not remove bookmark. Try again.', variant: 'error' })
    }
  }

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
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
        if (bookId) {
          // 2s debounce so fast scrubbing doesn't spam the backend.
          // Earlier this fired on every 'progress' message — multiple
          // PUTs per second for long chapters.
          if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
          const slugForSave = data.chapterSlug || chapterSlug || ''
          const offsetForSave = scrollOffsetRef.current
          const percentForSave = data.progress
          saveDebounceRef.current = setTimeout(() => {
            saveDebounceRef.current = null
            userBooksApi.updateUserBookProgress(bookId, {
              percent: percentForSave,
              chapterSlug: slugForSave,
              locator: `scroll:${slugForSave}:${offsetForSave}`,
            }).catch(e => { console.warn('Failed to save user-book progress:', e) })
          }, 2000)
        }
      } else if (data.type === 'loaded') {
        if (chapter?.next) {
          nextChapterRef.current = chapter.next
          injectJs('enableInfiniteScroll()')
        }
      } else if (data.type === 'requestNextChapter') {
        loadNextChapter()
      } else if (data.type === 'highlightTap') {
        const hl = highlightsRef.current.find(h => h.id === data.highlightId)
        if (hl) setEditingHighlight(hl)
      } else if (data.type === 'selection') {
        const mode: 'tap' | 'drag' = data.mode === 'tap' ? 'tap' : 'drag'
        const nextId = openSelection(data.text ? { ...data, mode } : null)
        if (nextId !== null && !data.text.includes(' ')) {
          // Auto-TTS + auto-save on single-word tap, mirrors public reader.
          toggleTts(data.text, { rate: settings.ttsSpeed, lang: language })
          void vocabActions.autoSaveWord(
            { text: data.text, sentence: data.sentence || '', anchor: data.anchor || null, selectionId: nextId },
            autoSavedRef,
          )
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[user-book-reader] postMessage handler threw', err, event?.nativeEvent?.data)
    }
  }, [chapter, bookId, chapterSlug, settings.ttsSpeed, isAuthenticated, language, toggleBars, showBars, hideBars, toggleTts, vocabActions, autoSavedRef, openSelection, setEditingHighlight, highlightsRef, updateSessionProgress])

  const handleSaveWord = () => {
    if (!selection) return
    void vocabActions.saveWord(selection)
  }

  const handleMarkKnown = () => {
    if (!selection) return
    void vocabActions.markKnown(selection)
  }

  const handleHighlight = async (color: string) => {
    if (!selection || !chapter) return
    await createHighlight({ color, selection, chapter: { id: chapter.id } })
    if (color === 'yellow' || color === 'green' || color === 'pink' || color === 'blue') {
      updateSettings({ lastHighlightColor: color })
    }
    setSelection(null)
  }

  // Mirror the public reader: tap = single-word layout of SelectionActionBar
  // (translation row + per-word actions); drag = layout chosen by content.
  const isMultiWord = !!(selection && selection.mode === 'drag' && selection.text.includes(' '))

  const navigateChapter = (slug: string) => {
    router.replace(`/my-books/read/${bookId}/${slug}`)
  }


  const loadNextChapter = async () => {
    const next = nextChapterRef.current
    if (!next || !bookId) return
    try {
      const ch = await userBooksApi.getUserBookChapter(bookId, next.slug)
      injectJs(`appendChapter(${JSON.stringify({ html: ch.html, title: ch.title, slug: ch.slug })})`)
      wordCountRef.current += ch.wordCount || 0
      nextChapterRef.current = ch.next || null
      if (!ch.next) injectJs('disableInfiniteScroll()')
    } catch (e) {
      // If we can't load the next chapter, turn off infinite scroll so
      // we don't retry-loop on every scroll gesture. A warn tells QA
      // the network (not the content) dropped us.
      console.warn('Failed to load next user-book chapter:', e)
      injectJs('disableInfiniteScroll()')
    }
  }

  const currentChapterIndex = chapters.findIndex(c => c.slug === chapterSlug)
  const totalChapters = chapters.length

  // Memoize HTML + WebView source — without this, every render (bars
  // toggle, progress tick, selection set) rebuilt the full chapter HTML
  // string AND created a new `{ html }` object, causing the WebView to
  // throw away its DOM and re-render. Public reader fixed this in B-36;
  // user-book reader was overlooked. Keep deps to actual style inputs.
  const html = useMemo(() => {
    if (!chapter) return ''
    return buildReaderHtml(chapter.html, {
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      fontFamily: resolvedFontFamily,
      textAlign: settings.textAlign,
      backgroundColor: resolvedTheme.backgroundColor,
      textColor: resolvedTheme.textColor,
    }, undefined, { top: insets.top, bottom: insets.bottom }, { overlayV2 })
  }, [chapter, settings.fontSize, settings.lineHeight, resolvedFontFamily, settings.textAlign, resolvedTheme.backgroundColor, resolvedTheme.textColor, insets.top, insets.bottom, overlayV2])

  const webViewSource = useMemo(() => ({ html }), [html])

  if (loading || !chapter) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!barsVisible} style={settings.theme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: barBg }]}>
        {/* WebView first — overlay bars rendered after so they sit on top of native layer */}
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
            // One-shot restore of saved scroll position. Settings changes
            // re-fire onLoadEnd; the ref guard keeps us from yanking the
            // user back to the original offset mid-read.
            if (!restoreScrolledRef.current && savedScrollOffsetRef.current != null) {
              const off = savedScrollOffsetRef.current
              restoreScrolledRef.current = true
              injectJs(`window.__textstackRestoreScroll && window.__textstackRestoreScroll(${off})`)
            }
          }}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
          // GPU-composited page on Android — library reader parity.
          androidLayerType="hardware"
          overScrollMode="never"
          bounces={false}
          menuItems={[]}
          cacheEnabled={false}
          // Intercept in-book links; route external URLs out to the OS
          // browser so the WebView keeps its injected script + DOM.
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

        {/* Top bar — after WebView so it renders on top */}
        <Animated.View style={[styles.topBar, { backgroundColor: barBg, borderBottomColor: barText + '20', paddingTop: insets.top, opacity: barsAnim, transform: [{ translateY: topBarTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.chapterTitle, { color: barText }]} numberOfLines={1}>
            {chapter.title}
          </Text>
          <View style={styles.topBarRight}>
            <TouchableOpacity onPress={() => setTocOpen(true)} style={styles.iconBtn}>
              <Ionicons name="list-outline" size={20} color={barText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToggleBookmark} style={styles.iconBtn}>
              <Ionicons name={isCurrentBookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={isCurrentBookmarked ? colors.primary : barText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="text-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </Animated.View>

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
            isSpeaking={isSpeaking}
            wordSaved={wordSaved}
            vocabStage={selection ? (vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null) : null}
            isAuthenticated={isAuthenticated}
          />
        )}

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

        <Animated.View style={[styles.footerOverlay, { backgroundColor: barBg, paddingBottom: insets.bottom, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
            </View>
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={() => chapter?.prev && navigateChapter(chapter.prev.slug)}
                disabled={!chapter?.prev}
                style={styles.chevronBtn}
                accessibilityLabel="Previous chapter"
                accessibilityRole="button"
              >
                <Text style={[styles.chevron, { color: chapter?.prev ? colors.text : colors.textSecondary, opacity: chapter?.prev ? 1 : 0.3 }]}>‹</Text>
              </TouchableOpacity>

              <View style={styles.footerInfo}>
                <Text style={[styles.footerChapter, { color: colors.text }]} numberOfLines={1}>
                  {chapter?.title || ''}
                </Text>
                <View style={styles.footerMeta}>
                  {totalChapters > 1 && currentChapterIndex >= 0 && (
                    <Text style={[styles.footerCounter, { color: colors.textSecondary }]}>
                      {currentChapterIndex + 1} / {totalChapters}
                    </Text>
                  )}
                  <Text style={[styles.footerPercent, { color: colors.textSecondary }]}>
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
                <Text style={[styles.chevron, { color: chapter?.next ? colors.text : colors.textSecondary, opacity: chapter?.next ? 1 : 0.3 }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />

        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(t) => toggleTts(t, { rate: settings.ttsSpeed, lang: language })}
          fromLang={language}
        />

        <ExplanationSheet
          visible={explainOpen}
          word={selection?.text || ''}
          sentence={selection?.sentence || selection?.text || ''}
          fromLang={language}
          onClose={() => setExplainOpen(false)}
        />

        <BookmarksSheet
          visible={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          bookmarks={bookmarks}
          currentChapterSlug={activeSlug || ''}
          onNavigate={navigateChapter}
          onDelete={handleDeleteBookmark}
          onToggleCurrent={handleToggleBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
        />

        <TocSheet
          visible={tocOpen}
          chapters={chapters}
          currentChapterSlug={activeSlug || ''}
          bookmarks={bookmarks.map(b => ({
            chapterSlug: b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator,
            title: b.title || undefined,
          }))}
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
          initialColor={(editingHighlight?.color ?? settings.lastHighlightColor) as 'yellow' | 'green' | 'pink' | 'blue'}
          onCancel={() => setEditingHighlight(null)}
          onColorChange={async (color) => {
            const hl = editingHighlight
            if (!hl) return
            updateSettings({ lastHighlightColor: color })
            await updateHighlightColor(hl.id, color)
          }}
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
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  topBarRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  iconBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
  chapterTitle: { flex: 1, textAlign: 'center' as const, fontSize: 14, fontWeight: '500' as const, fontFamily: fonts.sansMedium },
  webview: { flex: 1 },
  footerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    textAlign: 'center' as const,
    marginTop: 4,
    fontFamily: fonts.sans,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4, minHeight: 48 },
  chevronBtn: { width: 44, height: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
  chevron: { fontSize: 28, fontFamily: fonts.sans, lineHeight: 28 },
  footerInfo: { flex: 1, alignItems: 'center' as const, paddingHorizontal: 4 },
  footerChapter: { fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: '500' as const, textAlign: 'center' as const },
  footerMeta: { flexDirection: 'row', alignItems: 'center' as const, gap: 12, marginTop: 2 },
  footerCounter: { fontSize: 11, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  footerPercent: { fontSize: 11, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
})
