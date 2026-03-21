import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView, Animated } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { createBooksApi, readingProgressApi, bookmarksApi, vocabularyApi } from '@textstack/shared'
import type { Chapter, BookmarkDto, ChapterSummary } from '@textstack/shared'
import { buildReaderHtml } from '../../../src/lib/readerHtml'
import { getCachedChapter, getAllCachedBooks } from '../../../src/lib/offlineDb'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderSettings } from '../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../src/components/ReaderSettingsDrawer'
import { BookmarksSheet } from '../../../src/components/BookmarksSheet'
import { SelectionActionBar } from '../../../src/components/SelectionActionBar'
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
import { fonts } from '../../../src/theme/typography'

const LANG = 'en'

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
  const [selection, setSelection] = useState<{ text: string; sentence: string } | null>(null)
  const [wordSaved, setWordSaved] = useState(false)
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
  const totalWordCountRef = useRef(0)

  const { colors } = useTheme()
  const quickStats = useQuickStats(isAuthenticated)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)

  // Immersive mode — auto-hide bars
  const [barsVisible, setBarsVisible] = useState(true)
  const barsAnim = useRef(new Animated.Value(1)).current
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentChapterSlugRef = useRef<string | null>(null)

  // Reading session tracking
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: editionIdRef.current,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setBarsVisible(false)
      Animated.timing(barsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
    }, 3000)
  }, [barsAnim])

  const toggleBars = useCallback(() => {
    if (barsVisible) {
      setBarsVisible(false)
      Animated.timing(barsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      setBarsVisible(true)
      Animated.timing(barsAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      startHideTimer()
    }
  }, [barsVisible, barsAnim, startHideTimer])

  // Start hide timer when chapter loads
  useEffect(() => {
    if (!loading && chapter) startHideTimer()
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [loading, chapter, startHideTimer])

  // Resolve editionId from bookSlug (needed for progress + bookmarks)
  useEffect(() => {
    if (!bookSlug) return
    const api = createBooksApi(LANG)
    api.getBook(bookSlug)
      .then(b => {
        editionIdRef.current = b.id
        bookTitleRef.current = b.title
        setBookTitle(b.title)
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
  }, [bookSlug, isAuthenticated])

  useEffect(() => {
    if (!bookSlug || !chapterSlug) return

    ;(async () => {
      try {
        const api = createBooksApi(LANG)
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
    if (!isAuthenticated || !editionIdRef.current || !chapter || !chapterSlug) return
    const slug = currentChapterSlugRef.current || chapterSlug
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug: slug,
      progress: progressRef.current,
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
      } else if (data.type === 'progress') {
        progressRef.current = data.progress
        setProgress(data.progress)
        updateSessionProgress(data.progress)
        if (data.chapterSlug) currentChapterSlugRef.current = data.chapterSlug
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
      } else if (data.type === 'selection') {
        if (data.text) {
          setSelection({ text: data.text, sentence: data.sentence || '' })
          setWordSaved(false)
          // Auto-lookup: open dictionary for single words
          if (settings.autoLookup && !data.text.includes(' ') && data.text.length <= 50) {
            setDictOpen(true)
            if (isAuthenticated) {
              vocabularyApi.saveWord({
                word: data.text,
                sentence: data.sentence || null,
                bookTitle: bookTitleRef.current || null,
              }).catch(() => {})
            }
          }
        } else {
          setSelection(null)
        }
      }
    } catch {}
  }, [settings.autoLookup, isAuthenticated, toggleBars])

  const navigateChapter = (slug: string) => {
    saveProgress()
    router.replace(`/reader/${bookSlug}/${slug}`)
  }

  const isCurrentBookmarked = bookmarks.some(b => b.chapterSlug === chapterSlug)

  const toggleBookmark = async () => {
    if (!isAuthenticated || !editionIdRef.current || !chapter || !chapterSlug) return
    const existing = bookmarks.find(b => b.chapterSlug === chapterSlug)
    if (existing) {
      await bookmarksApi.deleteBookmark(existing.id).catch(() => {})
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
    } else {
      try {
        const bm = await bookmarksApi.createBookmark({
          editionId: editionIdRef.current,
          chapterId: chapter.id,
          locator: `chapter:${chapterSlug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch {}
    }
  }

  const handleSaveWord = async () => {
    if (!selection || !isAuthenticated) return
    try {
      await vocabularyApi.saveWord({
        word: selection.text,
        sentence: selection.sentence || null,
        bookTitle: bookTitleRef.current || null,
      })
      setWordSaved(true)
      setTimeout(() => { setSelection(null); setWordSaved(false) }, 1500)
    } catch {}
  }

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
      const api = createBooksApi(LANG)
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
  }, chapterSlug)

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
        {/* Top bar */}
        <Animated.View style={[styles.topBar, { backgroundColor: barBg, opacity: barsAnim }]} pointerEvents={barsVisible ? 'auto' : 'none'}>
          <TouchableOpacity onPress={() => { saveProgress(); router.back() }} style={styles.topBarBtn}>
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
          <View style={styles.topBarRight}>
            <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={20} color={barText} />
            </TouchableOpacity>
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
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="options-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Search bar */}
        {searchOpen && (
          <ReaderSearchBar
            onSearch={handleSearch}
            onNext={handleSearchNext}
            onPrev={handleSearchPrev}
            onClose={handleSearchClose}
            matchCount={searchMatchCount}
            currentMatch={searchCurrentMatch}
          />
        )}

        {/* Reader WebView */}
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        {/* Selection action bar */}
        {selection && (
          <SelectionActionBar
            selectedText={selection.text}
            isMultiWord={isMultiWord}
            onDictionary={() => setDictOpen(true)}
            onTranslate={() => setTranslateOpen(true)}
            onSpeak={() => toggleTts(selection.text, settings.ttsSpeed)}
            onSaveWord={handleSaveWord}
            isSpeaking={isSpeaking}
            wordSaved={wordSaved}
            isAuthenticated={isAuthenticated}
          />
        )}

        {/* Footer — progress bar + info row */}
        <Animated.View style={[styles.footer, { borderTopColor: barText + '15', opacity: barsAnim }]}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barText + '40' }]} />
          </View>
          <View style={styles.footerInfo}>
            <Text style={[styles.footerChapter, { color: barText + '99' }]} numberOfLines={1}>
              {chapter.title}
            </Text>
            <Text style={[styles.footerProgress, { color: barText + '99' }]}>
              {Math.round(progress * 100)}% · ~{etfDisplay}
            </Text>
          </View>
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
          currentChapterSlug={chapterSlug || ''}
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
          currentChapterSlug={chapterSlug || ''}
          bookmarks={bookmarks.map(b => ({ chapterSlug: b.chapterSlug }))}
          onNavigate={navigateChapter}
          onClose={() => setTocOpen(false)}
        />
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  // Top bar — matches PWA: 56px, blur bg, shadow
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
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
  // Footer — matches PWA: progress bar + chapter title (left) + % ETF (right)
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerChapter: { fontSize: 14, fontFamily: fonts.sans, maxWidth: '50%' },
  footerProgress: { fontSize: 14, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
  progressBar: { height: 4, borderRadius: 0 },
  progressFill: { height: 4, borderRadius: 0 },
})
