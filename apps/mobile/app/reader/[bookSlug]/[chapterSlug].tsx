import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native'
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

  // Reading session tracking
  const { updateProgress: updateSessionProgress, sessionStartedAt } = useReadingSession({
    editionId: editionIdRef.current,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  // Resolve editionId from bookSlug (needed for progress + bookmarks)
  useEffect(() => {
    if (!bookSlug) return
    const api = createBooksApi(LANG)
    api.getBook(bookSlug)
      .then(b => {
        editionIdRef.current = b.id
        bookTitleRef.current = b.title
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
    readingProgressApi.updateProgress(editionIdRef.current, {
      chapterId: chapter.id,
      chapterSlug,
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
      if (data.type === 'progress') {
        progressRef.current = data.progress
        setProgress(data.progress)
        updateSessionProgress(data.progress)
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
  }, [settings.autoLookup, isAuthenticated])

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
      injectJs(`appendChapter("${escaped}", ${JSON.stringify(ch.title)})`)
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
  })

  const barBg = resolvedTheme.backgroundColor
  const barText = resolvedTheme.textColor

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
        {/* Top bar */}
        <View style={[styles.topBar, { borderBottomColor: barText + '20' }]}>
          <TouchableOpacity onPress={() => { saveProgress(); router.back() }} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.chapterTitle, { color: barText }]} numberOfLines={1}>
            {chapter.title}
          </Text>
          <View style={styles.topBarRight}>
            <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={20} color={barText} />
            </TouchableOpacity>
            {chapters.length > 0 && (
              <TouchableOpacity onPress={() => setTocOpen(true)} style={styles.iconBtn}>
                <Ionicons name="list-outline" size={20} color={barText} />
              </TouchableOpacity>
            )}
            {isAuthenticated && (
              <TouchableOpacity onPress={() => setBookmarksOpen(true)} style={styles.iconBtn}>
                <Ionicons name={isCurrentBookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={barText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="text-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </View>

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

        {/* Progress bar + ETF */}
        <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {Math.round(progress * 100)}% · ~{etfMinutes} min left
          </Text>
        </View>

        {/* Reading stats widget */}
        {settings.showReaderStats && isAuthenticated && quickStats && (
          <ReaderStatsWidget
            sessionStartedAt={sessionStartedAt}
            todaySeconds={quickStats.todaySeconds}
            dailyGoalMinutes={quickStats.dailyGoalMinutes}
          />
        )}

        {/* Bottom navigation */}
        <View style={[styles.bottomBar, { borderTopColor: barText + '20' }]}>
          <TouchableOpacity
            style={[styles.navButton, !chapter.prev && styles.navDisabled]}
            disabled={!chapter.prev}
            onPress={() => chapter.prev && navigateChapter(chapter.prev.slug)}
          >
            <Text style={[styles.navText, { color: colors.primary }]}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, !chapter.next && styles.navDisabled]}
            disabled={!chapter.next}
            onPress={() => chapter.next && navigateChapter(chapter.next.slug)}
          >
            <Text style={[styles.navText, { color: colors.primary }]}>Next</Text>
          </TouchableOpacity>
        </View>

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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
  chapterTitle: { flex: 1, textAlign: 'center' as const, fontSize: 14, fontWeight: '500' as const, fontFamily: fonts.sansMedium },
  webview: { flex: 1 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  navButton: { paddingVertical: 8, paddingHorizontal: 16 },
  navDisabled: { opacity: 0.3 },
  navText: { fontSize: 15, fontWeight: '500', fontFamily: fonts.sansMedium },
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
})
