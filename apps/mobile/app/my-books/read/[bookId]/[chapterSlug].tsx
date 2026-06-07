import { useEffect, useState, useRef, useCallback } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { userBooksApi, parseScrollLocator } from '@textstack/shared'
import type { UserBookChapterDto, BookmarkDto } from '@textstack/shared'
import { useAuth } from '../../../../src/context/AuthContext'
import { useUserBookProgress } from '../../../../src/hooks/useUserBookProgress'
import { ReaderShell } from '../../../../src/components/reader/ReaderShell'
import { useToast } from '../../../../src/context/ToastContext'
import { useTheme } from '../../../../src/context/ThemeContext'
import { trackBookOpened } from '../../../../src/lib/analytics'

/**
 * User-uploaded book reader route. Thin wrapper around <ReaderShell>: owns the
 * /me/books data hooks (chapter, chapter list, bookmarks, progress, infinite
 * scroll) and hands the loaded chapter + a `kind: 'userbook'` source down. By
 * sharing the shell it now matches the public reader exactly — including the
 * inline-translation gloss + exit summary that used to be missing here.
 */
const bookmarkSlug = (b: BookmarkDto) => (b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator)

export default function UserBookReaderScreen() {
  const { bookId, chapterSlug } = useLocalSearchParams<{ bookId: string; chapterSlug: string }>()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { colors } = useTheme()
  const { show: showToast } = useToast()

  const [chapter, setChapter] = useState<UserBookChapterDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  const [chapters, setChapters] = useState<{ slug: string; title: string; chapterNumber?: number }[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(true)

  const webViewRef = useRef<WebView>(null)
  const injectJs = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`try{${js}}catch(e){console.error('[diag] injectJs failed:', e && e.message, ${JSON.stringify(js.slice(0, 80))});};true;`)
  }, [])

  const progressRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const currentChapterSlugRef = useRef<string | null>(null)
  const bookProgressRef = useRef<number | null>(null)
  const totalWordCountRef = useRef(0)
  const savedScrollOffsetRef = useRef<number | null>(null)
  const restoreScrolledRef = useRef(false)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)
  const wordCountRef = useRef(0)
  const bookTitleRef = useRef<string | null>(null)

  // Sync ref so callbacks fired after a setState see the current bookId
  // (mirrors editionIdRef in the public reader) — used by the shared
  // highlights/vocab hooks inside ReaderShell.
  const userBookIdRef = useRef<string | null>(null)
  useEffect(() => { userBookIdRef.current = bookId || null }, [bookId])

  const { saveProgress, bumpProgress } = useUserBookProgress({
    bookId: bookId || null,
    chapterSlug,
    currentChapterSlugRef,
    progressRef,
    scrollOffsetRef,
    bookProgressRef,
  })

  // Load the current chapter.
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
      .catch(e => { if (!cancelled) console.warn('Failed to load user book chapter:', e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookId, chapterSlug])

  // Load saved scroll offset for this chapter (server is the single source of truth).
  useEffect(() => {
    restoreScrolledRef.current = false
    savedScrollOffsetRef.current = null
    if (!bookId || !chapterSlug) return
    let cancelled = false
    userBooksApi.getUserBookProgress(bookId)
      .then(prog => {
        if (cancelled || !prog || prog.chapterSlug !== chapterSlug) return
        const parsed = parseScrollLocator(prog.locator)
        if (parsed && parsed.slug === chapterSlug && parsed.offset > 0) {
          savedScrollOffsetRef.current = parsed.offset
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bookId, chapterSlug])

  // Load bookmarks + chapter list for TOC + book-wide word count.
  const bookOpenedFiredRef = useRef(false)
  useEffect(() => {
    if (!bookId) return
    if (!bookOpenedFiredRef.current) {
      bookOpenedFiredRef.current = true
      trackBookOpened({ source: 'userbook', userBookId: bookId })
    }
    userBooksApi.getUserBookBookmarks(bookId).then(setBookmarks).catch(e => {
      console.warn('Failed to load user-book bookmarks:', e)
    })
    setChaptersLoading(true)
    userBooksApi.getUserBook(bookId).then(b => {
      bookTitleRef.current = b.title || null
      const mapped = b.chapters.map(ch => ({
        slug: ch.slug || `chapter-${ch.chapterNumber}`,
        title: ch.title,
        chapterNumber: ch.chapterNumber,
        wordCount: typeof ch.wordCount === 'number' && ch.wordCount > 0 ? ch.wordCount : 0,
      }))
      setChapters(mapped)
      const summed = mapped.reduce((s, c) => s + (c.wordCount || 0), 0)
      totalWordCountRef.current = (typeof b.totalWordCount === 'number' && b.totalWordCount > 0) ? b.totalWordCount : summed
    }).catch(e => {
      console.warn('Failed to load user-book chapter list:', e)
    }).finally(() => { setChaptersLoading(false) })
  }, [bookId])

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
      console.warn('Failed to load next user-book chapter:', e)
      injectJs('disableInfiniteScroll()')
    }
  }

  const toggleBookmark = async (slug: string) => {
    if (!bookId || !slug || !chapter) return
    const existing = bookmarks.find(b => bookmarkSlug(b) === slug)
    if (existing) {
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
          locator: `chapter:${slug}`,
          title: chapter.title,
        })
        setBookmarks(prev => [...prev, bm])
      } catch (e) {
        console.warn('Create user-book bookmark failed:', e)
        showToast({ message: 'Could not add bookmark. Try again.', variant: 'error' })
      }
    }
  }

  const deleteBookmark = async (bmId: string) => {
    if (!bookId) return
    const snapshot = bookmarks.find(b => b.id === bmId) ?? null
    setBookmarks(prev => prev.filter(b => b.id !== bmId))
    try {
      await userBooksApi.deleteUserBookBookmark(bookId, bmId)
    } catch (e) {
      console.warn('Delete user-book bookmark (sheet) failed:', e)
      if (snapshot) setBookmarks(prev => (prev.some(b => b.id === bmId) ? prev : [...prev, snapshot]))
      showToast({ message: 'Could not remove bookmark. Try again.', variant: 'error' })
    }
  }

  if (loading || !chapter) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ReaderShell
      source={{ kind: 'userbook', id: bookId || null, idRef: userBookIdRef }}
      webViewRef={webViewRef}
      injectJs={injectJs}
      chapter={{ id: chapter.id, title: chapter.title, html: chapter.html, prev: chapter.prev, next: chapter.next }}
      chapterSlug={chapterSlug}
      htmlChapterSlug={chapterSlug}
      bookTitle={bookTitleRef.current}
      chapters={chapters}
      chaptersLoading={chaptersLoading}
      progressRef={progressRef}
      scrollOffsetRef={scrollOffsetRef}
      currentChapterSlugRef={currentChapterSlugRef}
      bookProgressRef={bookProgressRef}
      totalWordCountRef={totalWordCountRef}
      bumpProgress={bumpProgress}
      saveProgress={saveProgress}
      restoreScrolledRef={restoreScrolledRef}
      savedScrollOffsetRef={savedScrollOffsetRef}
      onChapterLoaded={() => {
        if (chapter.next) {
          nextChapterRef.current = chapter.next
          injectJs('enableInfiniteScroll()')
        }
      }}
      onRequestNextChapter={loadNextChapter}
      onNavigateChapter={(slug) => router.replace(`/my-books/read/${bookId}/${slug}`)}
      bookmarks={bookmarks}
      onToggleCurrentBookmark={toggleBookmark}
      onDeleteBookmark={deleteBookmark}
      bookmarkChapterSlug={bookmarkSlug}
      bookTitleRef={bookTitleRef}
      wordCount={wordCountRef.current}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
