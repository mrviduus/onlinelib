import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { createBooksApi, readingProgressApi, bookmarksApi, vocabularyApi } from '@textstack/shared'
import type { Chapter, BookmarkDto } from '@textstack/shared'
import { buildReaderHtml } from '../../../src/lib/readerHtml'
import { getCachedChapter, getAllCachedBooks } from '../../../src/lib/offlineDb'
import { useAuth } from '../../../src/context/AuthContext'
import { useReaderSettings } from '../../../src/hooks/useReaderSettings'
import { ReaderSettingsDrawer } from '../../../src/components/ReaderSettingsDrawer'
import { BookmarksSheet } from '../../../src/components/BookmarksSheet'
import { useReadingSession } from '../../../src/hooks/useReadingSession'
import { colors } from '../../../src/theme/colors'

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
  const [selectedWord, setSelectedWord] = useState<{ text: string; sentence: string } | null>(null)
  const [wordSaved, setWordSaved] = useState(false)
  const webViewRef = useRef<WebView>(null)
  const progressRef = useRef(0)
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)
  const wordCountRef = useRef(0)

  // Reading session tracking
  const { updateProgress: updateSessionProgress } = useReadingSession({
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
        // Load bookmarks
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
        updateSessionProgress(data.progress)
      } else if (data.type === 'selection') {
        if (data.text) {
          setSelectedWord({ text: data.text, sentence: data.sentence || '' })
          setWordSaved(false)
        } else {
          setSelectedWord(null)
        }
      }
    } catch {}
  }, [])

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
    if (!selectedWord || !isAuthenticated) return
    try {
      await vocabularyApi.saveWord({
        word: selectedWord.text,
        sentence: selectedWord.sentence || null,
        bookTitle: bookTitleRef.current || null,
      })
      setWordSaved(true)
      setTimeout(() => { setSelectedWord(null); setWordSaved(false) }, 1500)
    } catch {}
  }

  const deleteBookmark = async (id: string) => {
    await bookmarksApi.deleteBookmark(id).catch(() => {})
    setBookmarks(prev => prev.filter(b => b.id !== id))
  }

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
            <Text style={[styles.backButton, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.chapterTitle, { color: barText }]} numberOfLines={1}>
            {chapter.title}
          </Text>
          <View style={styles.topBarRight}>
            {isAuthenticated && (
              <TouchableOpacity onPress={() => setBookmarksOpen(true)} style={styles.iconBtn}>
                <Text style={{ fontSize: 16 }}>{isCurrentBookmarked ? '★' : '☆'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.iconBtn}>
              <Text style={{ fontSize: 18 }}>Aa</Text>
            </TouchableOpacity>
          </View>
        </View>

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

        {/* Save word floating button */}
        {isAuthenticated && selectedWord && (
          <View style={styles.saveWordBar}>
            <Text style={styles.saveWordText} numberOfLines={1}>
              "{selectedWord.text}"
            </Text>
            <TouchableOpacity
              style={[styles.saveWordBtn, wordSaved && styles.saveWordBtnDone]}
              onPress={handleSaveWord}
              disabled={wordSaved}
            >
              <Text style={styles.saveWordBtnText}>
                {wordSaved ? 'Saved!' : 'Save Word'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom navigation */}
        <View style={[styles.bottomBar, { borderTopColor: barText + '20' }]}>
          <TouchableOpacity
            style={[styles.navButton, !chapter.prev && styles.navDisabled]}
            disabled={!chapter.prev}
            onPress={() => chapter.prev && navigateChapter(chapter.prev.slug)}
          >
            <Text style={styles.navText}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, !chapter.next && styles.navDisabled]}
            disabled={!chapter.next}
            onPress={() => chapter.next && navigateChapter(chapter.next.slug)}
          >
            <Text style={styles.navText}>Next</Text>
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
  topBarBtn: { width: 50 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 4, minWidth: 28, alignItems: 'center' },
  backButton: { fontSize: 15, fontWeight: '500' },
  chapterTitle: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500' },
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
  navText: { fontSize: 15, color: colors.primary, fontWeight: '500' },

  // Save word
  saveWordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primaryLight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveWordText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500', marginRight: 12 },
  saveWordBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  saveWordBtnDone: { backgroundColor: '#10B981' },
  saveWordBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
})
