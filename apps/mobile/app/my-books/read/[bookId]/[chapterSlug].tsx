import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { userBooksApi, vocabularyApi, highlightsApi } from '@textstack/shared'
import type { UserBookChapterDto, BookmarkDto, PublicHighlight } from '@textstack/shared'
import { buildReaderHtml } from '../../../../src/lib/readerHtml'
import { useAuth } from '../../../../src/context/AuthContext'
import { useReaderSettings } from '../../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../../src/components/ReaderSettingsDrawer'
import { SelectionActionBar } from '../../../../src/components/SelectionActionBar'
import { DictionarySheet } from '../../../../src/components/DictionarySheet'
import { TranslationSheet } from '../../../../src/components/TranslationSheet'
import { ReaderSearchBar } from '../../../../src/components/ReaderSearchBar'
import { BookmarksSheet } from '../../../../src/components/BookmarksSheet'
import { TocSheet } from '../../../../src/components/TocSheet'
import { useTts } from '../../../../src/hooks/useTts'
import { useReadingSession } from '../../../../src/hooks/useReadingSession'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../../src/context/ThemeContext'
import { fonts } from '../../../../src/theme/typography'

export default function UserBookReaderScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { settings, update: updateSettings, resolvedFontFamily, resolvedTheme } = useReaderSettings()
  const [chapter, setChapter] = useState<UserBookChapterDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selection, setSelection] = useState<{ text: string; sentence: string; anchor?: any } | null>(null)
  const [wordSaved, setWordSaved] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  const [progress, setProgress] = useState(0)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  const [chapters, setChapters] = useState<{ slug: string; title: string; chapterNumber?: number }[]>([])
  const { toggle: toggleTts, isSpeaking } = useTts()
  const { colors } = useTheme()
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)
  const wordCountRef = useRef(0)
  const highlightsRef = useRef<PublicHighlight[]>([])
  const { updateProgress: updateSessionProgress } = useReadingSession({
    editionId: null,
    userBookId: bookId || null,
    wordCount: wordCountRef.current,
    isAuthenticated,
  })

  useEffect(() => {
    if (!bookId || !chapterSlug) return
    setLoading(true)
    userBooksApi.getUserBookChapter(bookId, chapterSlug)
      .then(ch => {
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
      })
      .catch(e => console.error('Failed to load user book chapter:', e))
      .finally(() => setLoading(false))
  }, [bookId, chapterSlug])

  // Load bookmarks + chapter list for TOC
  useEffect(() => {
    if (!bookId) return
    userBooksApi.getUserBookBookmarks(bookId).then(setBookmarks).catch(() => {})
    userBooksApi.getUserBook(bookId).then(b => {
      setChapters(b.chapters.map(ch => ({
        slug: ch.slug || `chapter-${ch.chapterNumber}`,
        title: ch.title,
        chapterNumber: ch.chapterNumber,
      })))
    }).catch(() => {})
  }, [bookId])

  const isCurrentBookmarked = bookmarks.some(b => {
    const slug = b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator
    return slug === chapterSlug
  })

  const handleToggleBookmark = async () => {
    if (!bookId || !chapterSlug || !chapter) return
    const existing = bookmarks.find(b => {
      const slug = b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator
      return slug === chapterSlug
    })
    if (existing) {
      await userBooksApi.deleteUserBookBookmark(bookId, existing.id).catch(() => {})
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
    } else {
      try {
        const bm = await userBooksApi.createUserBookBookmark(bookId, {
          chapterId: chapter.id,
          locator: `chapter:${chapterSlug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch {}
    }
  }

  const handleDeleteBookmark = async (bmId: string) => {
    if (!bookId) return
    await userBooksApi.deleteUserBookBookmark(bookId, bmId).catch(() => {})
    setBookmarks(prev => prev.filter(b => b.id !== bmId))
  }

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'progress') {
        progressRef.current = data.progress
        setProgress(data.progress)
        updateSessionProgress(data.progress)
        if (bookId && chapterSlug) {
          userBooksApi.updateUserBookProgress(bookId, {
            percent: data.progress,
            chapterSlug,
          }).catch(() => {})
        }
      } else if (data.type === 'loaded') {
        if (chapter?.next) {
          nextChapterRef.current = chapter.next
          injectJs('enableInfiniteScroll()')
        }
      } else if (data.type === 'requestNextChapter') {
        loadNextChapter()
      } else if (data.type === 'search') {
        setSearchMatchCount(data.matchCount || 0)
        setSearchCurrentMatch(data.currentMatch || 0)
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
          if (settings.autoLookup && !data.text.includes(' ') && data.text.length <= 50) {
            setDictOpen(true)
            if (isAuthenticated) {
              vocabularyApi.saveWord({ word: data.text, language: 'en', sentence: data.sentence || null, bookTitle: null, userBookId: bookId || null }).catch(() => {})
            }
          }
        } else {
          setSelection(null)
        }
      }
    } catch {}
  }, [bookId, chapterSlug, settings.autoLookup, isAuthenticated])

  const handleSaveWord = async () => {
    if (!selection || !isAuthenticated) return
    try {
      await vocabularyApi.saveWord({
        word: selection.text,
        language: 'en',
        sentence: selection.sentence || null,
        bookTitle: null,
        userBookId: bookId || null,
      })
      setWordSaved(true)
      setTimeout(() => { setSelection(null); setWordSaved(false) }, 1500)
    } catch {}
  }

  const handleHighlight = async (color: string) => {
    if (!selection || !isAuthenticated || !bookId || !chapter) return
    try {
      const anchorJson = selection.anchor ? JSON.stringify(selection.anchor) : JSON.stringify({ exact: selection.text })
      const hl = await highlightsApi.createHighlight({
        userBookId: bookId,
        userChapterId: chapter.id,
        anchorJson,
        color,
        selectedText: selection.text,
      })
      injectJs(`renderHighlight(${JSON.stringify(hl.id)}, ${JSON.stringify(selection.text)}, ${JSON.stringify(color)})`)
      highlightsRef.current = [...highlightsRef.current, hl]
      setSelection(null)
    } catch (e) {
      console.error('Failed to create highlight:', e)
    }
  }

  // Load existing highlights for user book
  useEffect(() => {
    if (!isAuthenticated || !bookId || !chapter) return
    highlightsApi.getUserBookHighlights(bookId)
      .then(highlights => {
        const chapterHighlights = highlights.filter(h => h.userChapterId === chapter.id)
        highlightsRef.current = chapterHighlights
        for (const h of chapterHighlights) {
          injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.selectedText)}, ${JSON.stringify(h.color)})`)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, bookId, chapter])

  const isMultiWord = !!(selection && selection.text.includes(' '))

  const navigateChapter = (slug: string) => {
    router.replace(`/my-books/read/${bookId}/${slug}`)
  }

  const injectJs = (js: string) => webViewRef.current?.injectJavaScript(js + ';true;')
  const handleSearch = (q: string) => injectJs(`searchInContent(${JSON.stringify(q)})`)
  const handleSearchNext = () => injectJs('nextMatch()')
  const handleSearchPrev = () => injectJs('prevMatch()')
  const handleSearchClose = () => { injectJs('clearSearch()'); setSearchOpen(false) }

  const loadNextChapter = async () => {
    const next = nextChapterRef.current
    if (!next || !bookId) return
    try {
      const ch = await userBooksApi.getUserBookChapter(bookId, next.slug)
      const escaped = JSON.stringify(ch.html).slice(1, -1)
      injectJs(`appendChapter("${escaped}", ${JSON.stringify(ch.title)})`)
      wordCountRef.current += ch.wordCount || 0
      nextChapterRef.current = ch.next || null
      if (!ch.next) injectJs('disableInfiniteScroll()')
    } catch {
      injectJs('disableInfiniteScroll()')
    }
  }

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
        <View style={[styles.topBar, { borderBottomColor: barText + '20' }]}>
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
            <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={20} color={barText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Ionicons name="text-outline" size={20} color={barText} />
            </TouchableOpacity>
          </View>
        </View>

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

        <WebView
          ref={webViewRef}
          source={{ html }}
          style={[styles.webview, { backgroundColor: resolvedTheme.backgroundColor }]}
          onMessage={handleMessage}
          originWhitelist={['*']}
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        {selection && (
          <SelectionActionBar
            selectedText={selection.text}
            isMultiWord={isMultiWord}
            onDictionary={() => setDictOpen(true)}
            onTranslate={() => setTranslateOpen(true)}
            onSpeak={() => toggleTts(selection.text, settings.ttsSpeed)}
            onSaveWord={handleSaveWord}
            onHighlight={handleHighlight}
            isSpeaking={isSpeaking}
            wordSaved={wordSaved}
            isAuthenticated={isAuthenticated}
          />
        )}

        <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {Math.round(progress * 100)}% · ~{etfMinutes} min left
          </Text>
        </View>

        <View style={[styles.bottomBar, { borderTopColor: barText + '20' }]}>
          <TouchableOpacity
            style={[styles.navButton, !chapter.prev && styles.navDisabled]}
            disabled={!chapter.prev}
            onPress={() => chapter.prev && navigateChapter(chapter.prev.slug)}
          >
            <Text style={[styles.navText, { color: colors.primary }]}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setBookmarksOpen(true)} style={styles.iconBtn}>
            <Ionicons name="bookmarks-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, !chapter.next && styles.navDisabled]}
            disabled={!chapter.next}
            onPress={() => chapter.next && navigateChapter(chapter.next.slug)}
          >
            <Text style={[styles.navText, { color: colors.primary }]}>Next</Text>
          </TouchableOpacity>
        </View>

        <ReaderSettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
        />

        <DictionarySheet
          visible={dictOpen}
          word={selection?.text || ''}
          onClose={() => setDictOpen(false)}
          onSpeak={(t) => toggleTts(t, settings.ttsSpeed)}
        />

        <TranslationSheet
          visible={translateOpen}
          text={selection?.text || ''}
          onClose={() => setTranslateOpen(false)}
          onSpeak={(t) => toggleTts(t, settings.ttsSpeed)}
        />

        <BookmarksSheet
          visible={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          bookmarks={bookmarks}
          currentChapterSlug={chapterSlug || ''}
          onNavigate={navigateChapter}
          onDelete={handleDeleteBookmark}
          onToggleCurrent={handleToggleBookmark}
          isCurrentBookmarked={isCurrentBookmarked}
        />

        <TocSheet
          visible={tocOpen}
          chapters={chapters}
          currentChapterSlug={chapterSlug || ''}
          bookmarks={bookmarks.map(b => ({
            chapterSlug: b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator,
            title: b.title || undefined,
          }))}
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
  topBarRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
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
  navText: { fontSize: 15, fontWeight: '500' as const, fontFamily: fonts.sansMedium },
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
