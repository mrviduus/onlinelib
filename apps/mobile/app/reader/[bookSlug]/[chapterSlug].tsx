import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Alert } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { createBooksApi, readingProgressApi, bookmarksApi, vocabularyApi, highlightsApi, translationApi } from '@textstack/shared'
import type { Chapter, BookmarkDto, ChapterSummary, PublicHighlight } from '@textstack/shared'
import { buildReaderHtml } from '../../../src/lib/readerHtml'
import { getCachedChapter, getAllCachedBooks } from '../../../src/lib/offlineDb'
import { saveLocalProgress } from '../../../src/lib/progressStorage'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderSettings } from '../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../src/components/ReaderSettingsDrawer'
import { BookmarksSheet } from '../../../src/components/BookmarksSheet'
import { SelectionActionBar } from '../../../src/components/SelectionActionBar'
import { WordCard } from '../../../src/components/WordCard'
import { DictionarySheet } from '../../../src/components/DictionarySheet'
import { TranslationSheet } from '../../../src/components/TranslationSheet'
import { TocSheet } from '../../../src/components/TocSheet'
import { ReaderSearchBar } from '../../../src/components/ReaderSearchBar'
import { ReaderStatsWidget } from '../../../src/components/ReaderStatsWidget'
import { useReadingSession } from '../../../src/hooks/useReadingSession'
import { useTts } from '../../../src/hooks/useTts'
import { useQuickStats } from '../../../src/hooks/useQuickStats'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../src/context/ThemeContext'
import { useLanguage } from '../../../src/context/LanguageContext'
import { useNativeLanguage } from '../../../src/context/NativeLanguageContext'
import { fonts } from '../../../src/theme/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { trackBookOpened, trackVocabSaved, trackTranslationUsed } from '../../../src/lib/analytics'

/** Extract chapterSlug from bookmark locator (format: "chapter:slug") */
function getSlugFromLocator(locator: string): string {
  return locator.startsWith('chapter:') ? locator.slice(8) : locator
}

export default function ReaderScreen() {
  const { bookSlug, chapterSlug } = useLocalSearchParams<{ bookSlug: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  const [selection, setSelection] = useState<{ text: string; sentence: string; anchor?: any } | null>(null)
  const [wordSaved, setWordSaved] = useState(false)
  const [sessionWordCount, setSessionWordCount] = useState(0)
  const [exitSummary, setExitSummary] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  const [chapters, setChapters] = useState<ChapterSummary[]>([])
  const [progress, setProgress] = useState(0)
  const [bookTitle, setBookTitle] = useState('')
  const { toggle: toggleTts, isSpeaking } = useTts()
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)
  const wordCountRef = useRef(0)
  const highlightsRef = useRef<PublicHighlight[]>([])
  const totalWordCountRef = useRef(0)

  const { colors } = useTheme()
  const { language } = useLanguage()
  const { nativeLanguage } = useNativeLanguage()
  const quickStats = useQuickStats(isAuthenticated)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)
  const insets = useSafeAreaInsets()
  const topBarHeight = 56 + insets.top
  const footerHeight = 60 + insets.bottom

  // Immersive mode — auto-hide bars
  const [barsVisible, setBarsVisible] = useState(true)
  const barsVisibleRef = useRef(true)
  const barsAnim = useRef(new Animated.Value(1)).current
  const topBarTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [-topBarHeight, 0] })
  const footerTranslateY = barsAnim.interpolate({ inputRange: [0, 1], outputRange: [footerHeight, 0] })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentChapterSlugRef = useRef<string | null>(null)
  const [visibleChapterSlug, setVisibleChapterSlug] = useState<string | null>(null)

  // Reading session tracking
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: editionIdRef.current,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

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

  // When chapter first loads, show bars briefly then auto-hide so the
  // reader has chrome to orient with. From there on, visibility is
  // driven entirely by scroll direction (see handleMessage 'scrollDir').
  useEffect(() => {
    if (!loading && chapter) startHideTimer()
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [loading, chapter, startHideTimer])

  // Resolve editionId from bookSlug (needed for progress + bookmarks)
  const bookOpenedFiredRef = useRef(false)
  useEffect(() => {
    if (!bookSlug) return
    const api = createBooksApi(language)
    api.getBook(bookSlug)
      .then(b => {
        editionIdRef.current = b.id
        bookTitleRef.current = b.title
        setBookTitle(b.title)
        if (!bookOpenedFiredRef.current) {
          bookOpenedFiredRef.current = true
          trackBookOpened({ source: 'library', editionId: b.id, language })
        }
        if (b.chapters) {
          setChapters(b.chapters)
          totalWordCountRef.current = b.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
        }
        if (isAuthenticated) {
          bookmarksApi.getBookmarks(b.id)
            .then(setBookmarks)
            .catch(() => {})
        }
      })
      .catch(() => {
        getAllCachedBooks().then(books => {
          const match = books.find(b => b.slug === bookSlug)
          if (match) editionIdRef.current = match.editionId
        }).catch(() => {})
      })
  }, [bookSlug, isAuthenticated, language])

  useEffect(() => {
    if (!bookSlug || !chapterSlug) return

    ;(async () => {
      try {
        const api = createBooksApi(language)
        const ch = await api.getChapter(bookSlug, chapterSlug)
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
      } catch {
        try {
          const books = await getAllCachedBooks()
          for (const book of books) {
            if (book.slug === bookSlug) {
              const cached = await getCachedChapter(book.editionId, chapterSlug)
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
                break
              }
            }
          }
        } catch (e) {
          console.error('Offline cache failed:', e)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [bookSlug, chapterSlug])

  const saveProgress = useCallback(() => {
    if (!editionIdRef.current || !chapter || !chapterSlug) return
    const slug = currentChapterSlugRef.current || chapterSlug
    const percent = progressRef.current
    const updatedAt = Date.now()

    // Offline-first: always persist locally, even for guests. Survives flaky network,
    // crashes between PUTs, and gives ContinueReadingCard a fallback when server is
    // unreachable. LWW merge in consumers uses this `updatedAt`.
    saveLocalProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      percent,
      updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      progress: percent,
    }).catch(() => {})
  }, [isAuthenticated, chapter, chapterSlug])

  // Save progress when leaving reader
  useEffect(() => {
    return () => { saveProgress() }
  }, [saveProgress])

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
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
      } else if (data.type === 'search') {
        setSearchMatchCount(data.matchCount || 0)
        setSearchCurrentMatch(data.currentMatch || 0)
      } else if (data.type === 'loaded') {
        // Enable infinite scroll if there's a next chapter
        if (chapter?.next) {
          nextChapterRef.current = chapter.next
          injectJs('enableInfiniteScroll()')
        }
      } else if (data.type === 'requestNextChapter') {
        loadNextChapter()
      } else if (data.type === 'highlightTap') {
        const hl = highlightsRef.current.find(h => h.id === data.highlightId)
        if (hl) {
          Alert.prompt(
            'Highlight Note',
            `"${hl.selectedText.substring(0, 60)}${hl.selectedText.length > 60 ? '...' : ''}"`,
            [
              { text: 'Delete', style: 'destructive', onPress: async () => {
                try {
                  await highlightsApi.deleteHighlight(hl.id)
                  injectJs(`removeHighlight(${JSON.stringify(hl.id)})`)
                  highlightsRef.current = highlightsRef.current.filter(h => h.id !== hl.id)
                } catch {}
              }},
              { text: 'Cancel', style: 'cancel' },
              { text: 'Save', onPress: async (noteText?: string) => {
                try {
                  const updated = await highlightsApi.updateHighlight(hl.id, { noteText: noteText?.trim() || null })
                  highlightsRef.current = highlightsRef.current.map(h => h.id === hl.id ? updated : h)
                } catch {}
              }},
            ],
            'plain-text',
            hl.noteText || '',
          )
        }
      } else if (data.type === 'selection') {
        if (data.text) {
          setSelection({ text: data.text, sentence: data.sentence || '', anchor: data.anchor || null })
          setWordSaved(false)
          // Single word: auto-TTS + auto-save to vocabulary (matches web behavior)
          if (!data.text.includes(' ')) {
            toggleTts(data.text, settings.ttsSpeed)
            if (isAuthenticated && !vocabMapRef.current[data.text.toLowerCase()]) {
              vocabularyApi.saveWord({
                word: data.text,
                language,
                sentence: data.sentence || null,
                bookTitle: bookTitleRef.current || null,
                editionId: editionIdRef.current || null,
                chapterId: chapter?.id || null,
              }).then(saved => {
                const key = saved.word.toLowerCase()
                vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
                injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
                setWordSaved(true)
                setSessionWordCount(c => c + 1)
                trackVocabSaved({ language, nativeLanguage, source: 'reader' })
                // Persist translation
                const targetLang = nativeLanguage !== language ? nativeLanguage : (language === 'uk' ? 'en' : 'uk')
                trackTranslationUsed({ fromLang: language, toLang: targetLang, kind: 'word' })
                translationApi.translate(data.text, language, targetLang)
                  .then(res => {
                    if (res.translatedText && saved.id) {
                      vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
                      vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
                    }
                  }).catch(() => {})
              }).catch(() => {})
            }
          }
        } else {
          setSelection(null)
        }
      }
    } catch {}
  }, [chapter, settings.autoLookup, isAuthenticated, toggleBars, showBars, hideBars])

  const navigateChapter = (slug: string) => {
    saveProgress()
    router.replace(`/reader/${bookSlug}/${slug}`)
  }

  const activeSlug = visibleChapterSlug ?? chapterSlug
  const isCurrentBookmarked = bookmarks.some(b => getSlugFromLocator(b.locator) === activeSlug)

  const toggleBookmark = async () => {
    if (!isAuthenticated || !editionIdRef.current || !chapter || !activeSlug) return
    const existing = bookmarks.find(b => getSlugFromLocator(b.locator) === activeSlug)
    if (existing) {
      await bookmarksApi.deleteBookmark(existing.id).catch(() => {})
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
    } else {
      try {
        const bm = await bookmarksApi.createBookmark({
          editionId: editionIdRef.current,
          chapterId: chapter.id,
          locator: `chapter:${activeSlug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch {}
    }
  }

  const handleSaveWord = async () => {
    if (!selection || !isAuthenticated) return
    try {
      const saved = await vocabularyApi.saveWord({
        word: selection.text,
        language,
        sentence: selection.sentence || null,
        bookTitle: bookTitleRef.current || null,
        editionId: editionIdRef.current || null,
        chapterId: chapter?.id || null,
      })
      // Update local vocab map + WebView underlines
      const key = saved.word.toLowerCase()
      vocabMapRef.current[key] = { stage: saved.stage, id: saved.id }
      injectJs(`addVocabWord(${JSON.stringify(key)}, ${saved.stage})`)
      setWordSaved(true)
      setSessionWordCount(c => c + 1)
      trackVocabSaved({ language, nativeLanguage, source: 'reader' })
      // Persist translation to saved word (fire-and-forget)
      const targetLang = nativeLanguage !== language ? nativeLanguage : (language === 'uk' ? 'en' : 'uk')
      trackTranslationUsed({ fromLang: language, toLang: targetLang, kind: 'word' })
      translationApi.translate(selection.text, language, targetLang)
        .then(res => {
          if (res.translatedText && saved.id) {
            vocabularyApi.updateWord(saved.id, { translation: res.translatedText }).catch(() => {})
            vocabMapRef.current[key] = { ...vocabMapRef.current[key], translation: res.translatedText }
          }
        })
        .catch(() => {})
    } catch {}
  }

  const handleMarkKnown = async () => {
    if (!selection || !isAuthenticated) return
    const key = selection.text.toLowerCase()
    const entry = vocabMapRef.current[key]
    if (!entry) return
    try {
      await vocabularyApi.markAsKnown(entry.id)
      vocabMapRef.current[key] = { ...entry, stage: 4 }
      injectJs(`addVocabWord(${JSON.stringify(key)}, 4)`)
      setSelection(null)
    } catch {}
  }

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleExit = () => {
    saveProgress()
    if (sessionWordCount > 0) {
      setExitSummary(true)
      exitTimerRef.current = setTimeout(() => router.back(), 5000)
    } else {
      router.back()
    }
  }

  const handleExitReview = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.replace('/vocabulary/review')
  }

  const handleExitLater = () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    router.back()
  }

  const handleHighlight = async (color: string) => {
    if (!selection || !isAuthenticated || !editionIdRef.current || !chapter) return
    try {
      const anchorJson = selection.anchor ? JSON.stringify(selection.anchor) : JSON.stringify({ exact: selection.text })
      const hl = await highlightsApi.createHighlight({
        editionId: editionIdRef.current,
        chapterId: chapter.id,
        anchorJson,
        color,
        selectedText: selection.text,
      })
      // Render highlight in WebView
      injectJs(`renderHighlight(${JSON.stringify(hl.id)}, ${JSON.stringify(selection.text)}, ${JSON.stringify(color)})`)
      highlightsRef.current = [...highlightsRef.current, hl]
      setSelection(null)
    } catch (e) {
      console.error('Failed to create highlight:', e)
    }
  }

  // Load and render existing highlights when chapter loads
  useEffect(() => {
    if (!isAuthenticated || !editionIdRef.current || !chapter) return
    highlightsApi.getHighlights(editionIdRef.current)
      .then(highlights => {
        const chapterHighlights = highlights.filter(h => h.chapterId === chapter.id)
        highlightsRef.current = chapterHighlights
        for (const h of chapterHighlights) {
          injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.selectedText)}, ${JSON.stringify(h.color)})`)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, chapter])

  // Vocab map ref for selection lookups
  const vocabMapRef = useRef<Record<string, { stage: number; id: string; translation?: string }>>({})

  // Load and render vocab word underlines
  useEffect(() => {
    if (!isAuthenticated || !chapter) return
    vocabularyApi.getReaderVocab()
      .then(words => {
        if (words.length === 0) return
        const map: Record<string, { stage: number; id: string; translation?: string }> = {}
        for (const w of words) map[w.word.toLowerCase()] = { stage: w.stage, id: w.id, translation: w.translation }
        vocabMapRef.current = map
        injectJs(`markVocabWords(${JSON.stringify(map)})`)
      })
      .catch(() => {})
  }, [isAuthenticated, chapter])

  // Sync inline translations setting to WebView
  useEffect(() => {
    injectJs(`setShowInlineTranslations(${settings.showInlineTranslations})`)
  }, [settings.showInlineTranslations])

  const isMultiWord = !!(selection && selection.text.includes(' '))

  const deleteBookmark = async (id: string) => {
    await bookmarksApi.deleteBookmark(id).catch(() => {})
    setBookmarks(prev => prev.filter(b => b.id !== id))
  }

  const injectJs = (js: string) => webViewRef.current?.injectJavaScript(js + ';true;')
  const handleSearch = (q: string) => injectJs(`searchInContent(${JSON.stringify(q)})`)
  const handleSearchNext = () => injectJs('nextMatch()')
  const handleSearchPrev = () => injectJs('prevMatch()')
  const handleSearchClose = () => { injectJs('clearSearch()'); setSearchOpen(false) }

  const loadNextChapter = async () => {
    const next = nextChapterRef.current
    if (!next || !bookSlug) return
    try {
      const api = createBooksApi(language)
      const ch = await api.getChapter(bookSlug, next.slug)
      const escaped = JSON.stringify(ch.html).slice(1, -1) // remove outer quotes
      injectJs(`appendChapter("${escaped}", ${JSON.stringify(ch.title)}, ${JSON.stringify(ch.slug)})`)
      wordCountRef.current += ch.wordCount || 0
      nextChapterRef.current = ch.next || null
      if (!ch.next) injectJs('disableInfiniteScroll()')
    } catch {
      injectJs('disableInfiniteScroll()')
    }
  }

  // ETF calculation
  const wordsLeft = wordCountRef.current * (1 - progress)
  const etfMinutes = Math.max(1, Math.round(wordsLeft / 250))
  const etfDisplay = etfMinutes >= 60 ? `${Math.floor(etfMinutes / 60)}h ${etfMinutes % 60}m` : `${etfMinutes}m`

  if (loading || !chapter) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const html = buildReaderHtml(chapter.html, {
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    fontFamily: resolvedFontFamily,
    textAlign: settings.textAlign,
    backgroundColor: resolvedTheme.backgroundColor,
    textColor: resolvedTheme.textColor,
  }, chapterSlug, { top: insets.top, bottom: insets.bottom })

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden={!barsVisible} />
      <View style={[styles.container, { backgroundColor: barBg }]}>
        {/* Reader WebView — rendered first so overlay bars sit on top */}
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        {/* Top bar — rendered after WebView so it's on top of native layer */}
        <Animated.View style={[styles.topBar, { backgroundColor: barBg, paddingTop: insets.top, opacity: barsAnim, transform: [{ translateY: topBarTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <TouchableOpacity onPress={handleExit} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color={barText} />
          </TouchableOpacity>
          <View style={styles.titleStack}>
            {bookTitle ? (
              <Text style={[styles.bookTitle, { color: barText }]} numberOfLines={1}>{bookTitle}</Text>
            ) : null}
            <Text style={[styles.chapterTitle, { color: barText + '99' }]} numberOfLines={1}>
              {chapter.title}
            </Text>
          </View>
          {sessionWordCount > 0 && (
            <View style={styles.wordsBadge}>
              <Ionicons name="school" size={12} color="#10B981" />
              <Text style={styles.wordsBadgeText}>{sessionWordCount}</Text>
            </View>
          )}
          <View style={styles.topBarRight}>
            {isAuthenticated && (
              <TouchableOpacity onPress={() => setBookmarksOpen(true)} style={styles.iconBtn}>
                <Ionicons name={isCurrentBookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={barText} />
              </TouchableOpacity>
            )}
            {chapters.length > 0 && (
              <TouchableOpacity onPress={() => setTocOpen(true)} style={styles.iconBtn}>
                <Ionicons name="list-outline" size={20} color={barText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.push(`/reader/${bookSlug}/focus/${chapterSlug}`)}
              style={styles.iconBtn}
              accessibilityLabel="Focus mode"
            >
              <Ionicons name="contract-outline" size={20} color={barText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="options-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Search bar */}
        {searchOpen && (
          <View style={{ position: 'absolute', top: topBarHeight, left: 0, right: 0, zIndex: 10 }}>
            <ReaderSearchBar
              onSearch={handleSearch}
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              onClose={handleSearchClose}
              matchCount={searchMatchCount}
              currentMatch={searchCurrentMatch}
            />
          </View>
        )}

        {/* Selection: WordCard for single words, ActionBar for multi-word */}
        {selection && (
          isMultiWord ? (
            <SelectionActionBar
              selectedText={selection.text}
              isMultiWord
              onDictionary={() => setDictOpen(true)}
              onTranslate={() => setTranslateOpen(true)}
              onSpeak={() => toggleTts(selection.text, settings.ttsSpeed)}
              onSaveWord={handleSaveWord}
              onHighlight={handleHighlight}
              onMarkKnown={handleMarkKnown}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
            />
          ) : (
            <WordCard
              word={selection.text}
              onSave={handleSaveWord}
              onSpeak={() => toggleTts(selection.text, settings.ttsSpeed)}
              onDictionary={() => setDictOpen(true)}
              onHighlight={handleHighlight}
              onMarkKnown={handleMarkKnown}
              onDismiss={() => { setSelection(null); setWordSaved(false) }}
              isSpeaking={isSpeaking}
              wordSaved={wordSaved}
              vocabStage={vocabMapRef.current[selection.text.toLowerCase()]?.stage ?? null}
              isAuthenticated={isAuthenticated}
              language={language}
              sessionWordCount={sessionWordCount}
            />
          )
        )}

        {/* Footer — progress bar + info */}
        <Animated.View style={[styles.footer, { backgroundColor: barBg, borderTopColor: barText + '15', paddingBottom: insets.bottom, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barText + '40' }]} />
          </View>
          <Text style={[styles.footerProgress, { color: barText + '99', textAlign: 'center', paddingVertical: 8, paddingHorizontal: 16 }]}>
            {Math.round(progress * 100)}% · ~{etfDisplay}
          </Text>
        </Animated.View>

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
          onDelete={deleteBookmark}
          onToggleCurrent={toggleBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
        />

        {/* Dictionary sheet */}
        <DictionarySheet
          visible={dictOpen}
          word={selection?.text || ''}
          onClose={() => setDictOpen(false)}
          onSpeak={(t) => toggleTts(t, settings.ttsSpeed)}
        />

        {/* Translation sheet */}
        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(t) => toggleTts(t, settings.ttsSpeed)}
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
  container: { flex: 1 },
  // Top bar — absolute overlay, slides down on tap
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topBarBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  titleStack: { flex: 1, marginHorizontal: 8 },
  bookTitle: { fontSize: 14, fontWeight: '600' as const, fontFamily: fonts.sansMedium },
  chapterTitle: { fontSize: 12, fontFamily: fonts.sans },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { padding: 8, minWidth: 40, minHeight: 40, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: 4 },
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
  footerProgress: { fontSize: 14, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
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
  // Words badge in top bar
  wordsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  wordsBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: '#10B981',
  },
})
