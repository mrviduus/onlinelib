import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import { userBooksApi, parseScrollLocator, buildUserBookProgressPayload } from '@textstack/shared'
import type { UserBookChapterDto, BookmarkDto } from '@textstack/shared'
import { saveUserBookLocalProgress } from '../../lib/progressStorage'
import { useReaderPersistence } from '../../hooks/useReaderPersistence'
import { trackBookOpened } from '../../lib/analytics'
import type { ProgressSnapshot, ReaderChapterMeta, ReaderRuntime, SavedPosition } from './readerSource'

type ToastFn = (t: { message: string; variant: 'error' | 'success' | 'info' }) => void

type Params = {
  bookId: string
  chapterSlug: string
  showToast: ToastFn
}

const bookmarkSlug = (b: BookmarkDto) => (b.locator.startsWith('chapter:') ? b.locator.slice(8) : b.locator)

/**
 * User-uploaded book data source for the unified `<Reader>`. Owns the
 * /me/books data loading (chapter, chapter list, bookmarks) and supplies the
 * user-book progress I/O (`persist` / `loadPosition`) to the shared
 * `useReaderPersistence`. Returns the same normalized `ReaderRuntime` the
 * catalog source does — so there is one reader code path.
 *
 * Server stores chapter-level percent only; book-percent is cached locally
 * for the home/library "% of book" UX.
 */
export function useUserBookReaderSource({ bookId, chapterSlug, showToast }: Params): ReaderRuntime {
  const router = useRouter()

  const webViewRef = useRef<WebView>(null)
  const injectJs = useCallback((js: string) => {
    webViewRef.current?.injectJavaScript(`try{${js}}catch(e){console.error('[diag] injectJs failed:', e && e.message, ${JSON.stringify(js.slice(0, 80))});};true;`)
  }, [])

  const progressRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const currentChapterSlugRef = useRef<string | null>(null)
  const bookProgressRef = useRef<number | null>(null)
  const totalWordCountRef = useRef(0)
  const wordCountRef = useRef(0)
  const bookTitleRef = useRef<string | null>(null)
  const userBookIdRef = useRef<string | null>(null)
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)

  const [chapter, setChapter] = useState<UserBookChapterDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [chapterError, setChapterError] = useState<'offline' | 'notfound' | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([])
  const [chapters, setChapters] = useState<ReaderChapterMeta[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(true)
  const [bookTitle, setBookTitle] = useState<string | null>(null)

  useEffect(() => { userBookIdRef.current = bookId || null }, [bookId])

  // Load the current chapter.
  useEffect(() => {
    if (!bookId || !chapterSlug) return
    let cancelled = false
    setLoading(true)
    setChapterError(null)
    userBooksApi.getUserBookChapter(bookId, chapterSlug)
      .then(ch => {
        if (cancelled) return
        setChapter(ch)
        wordCountRef.current = ch.wordCount || 0
      })
      .catch(e => {
        if (cancelled) return
        console.warn('Failed to load user book chapter:', e)
        setChapterError('notfound')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookId, chapterSlug])

  // Load bookmarks + chapter list (TOC + book-wide word count) + analytics.
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
      setBookTitle(b.title || null)
      const mapped: ReaderChapterMeta[] = b.chapters.map(ch => ({
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

  const persist = useCallback((snap: ProgressSnapshot) => {
    if (!bookId) return
    const payload = buildUserBookProgressPayload({
      currentChapterSlug: snap.chapterSlug,
      fallbackChapterSlug: snap.chapterSlug,
      chapterProgress: snap.chapterPercent,
      scrollOffset: snap.scrollOffset,
      // Store book-wide % (canonical ProgressPercent) — same semantics the web
      // reader and library shelf use. computeBookProgress turns the within-chapter
      // scroll into a book-wide value using the chapter word counts.
      chapters,
      totalWordCount: totalWordCountRef.current || undefined,
    })
    if (payload) {
      userBooksApi.updateUserBookProgress(bookId, payload)
        .catch(e => { if (__DEV__) console.warn('[user-book-progress] PUT failed:', e) })
    }
    if (typeof snap.bookPercent === 'number') {
      saveUserBookLocalProgress(bookId, { bookPercent: snap.bookPercent, updatedAt: snap.updatedAt }).catch(() => {})
    }
  }, [bookId, chapters])

  const loadPosition = useCallback(async (slug: string): Promise<SavedPosition> => {
    try {
      const prog = await userBooksApi.getUserBookProgress(bookId)
      if (prog && prog.chapterSlug === slug) {
        const parsed = parseScrollLocator(prog.locator)
        if (parsed && parsed.slug === slug && parsed.offset > 0) return { offset: parsed.offset, percent: null }
        // Percent fallback — was missing on user-book reader (one half of the
        // "returns to top" bug); now shared with catalog so it can't drift.
        if (typeof prog.percent === 'number' && prog.percent > 0.005 && prog.percent < 0.999) {
          return { offset: null, percent: prog.percent }
        }
      }
    } catch {}
    return { offset: null, percent: null }
  }, [bookId])

  const { saveProgress, bumpProgress, onWebViewLoaded } = useReaderPersistence({
    bookKey: bookId || null,
    chapterSlug,
    chapterId: chapter?.id ?? null,
    injectJs,
    progressRef, scrollOffsetRef, currentChapterSlugRef, bookProgressRef,
    persist, loadPosition,
  })

  const loadNext = useCallback(async () => {
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
  }, [bookId, injectJs])

  const toggleBookmark = useCallback(async (slug: string) => {
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
  }, [bookId, chapter, bookmarks, showToast])

  const deleteBookmark = useCallback(async (bmId: string) => {
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
  }, [bookId, bookmarks, showToast])

  return {
    source: { kind: 'userbook', id: bookId || null, idRef: userBookIdRef },
    webViewRef,
    injectJs,
    chapter: chapter
      ? { id: chapter.id, title: chapter.title, html: chapter.html, prev: chapter.prev, next: chapter.next }
      : null,
    loading,
    chapterError,
    chapterSlug,
    htmlChapterSlug: chapterSlug,
    bookTitle,
    bookTitleRef,
    chapters,
    chaptersLoading,
    wordCount: wordCountRef.current,
    progressRef, scrollOffsetRef, currentChapterSlugRef, bookProgressRef, totalWordCountRef,
    saveProgress, bumpProgress, onWebViewLoaded,
    onChapterLoaded: () => {
      if (chapter?.next) {
        nextChapterRef.current = chapter.next
        injectJs('enableInfiniteScroll()')
      }
    },
    onRequestNextChapter: loadNext,
    onNavigateChapter: (slug) => router.replace(`/my-books/read/${bookId}/${slug}`),
    bookmarks,
    onToggleCurrentBookmark: toggleBookmark,
    onDeleteBookmark: deleteBookmark,
    bookmarkChapterSlug: bookmarkSlug,
    askTarget: bookId ? { kind: 'userbook', id: bookId } : undefined,
  }
}
