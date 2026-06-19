import { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import { readingProgressApi, parseScrollLocator } from '@textstack/shared'
import type { Language } from '@textstack/shared'
import { getLocalProgress, saveLocalProgress } from '../../lib/progressStorage'
import { useReaderChapter } from '../../hooks/useReaderChapter'
import { useReaderBook } from '../../hooks/useReaderBook'
import { useReaderBookmarks, getSlugFromLocator } from '../../hooks/useReaderBookmarks'
import { useReaderInfiniteScroll } from '../../hooks/useReaderInfiniteScroll'
import { useReaderPersistence } from '../../hooks/useReaderPersistence'
import type { ProgressSnapshot, ReaderRuntime, SavedPosition } from './readerSource'

type ToastFn = (t: { message: string; variant: 'error' | 'success' | 'info' }) => void

type Params = {
  bookSlug: string
  chapterSlug: string
  language: Language
  isAuthenticated: boolean
  showToast: ToastFn
}

/**
 * Catalog (edition) data source for the unified `<Reader>`. Composes the
 * battle-tested catalog hooks (chapter / book / bookmarks / infinite scroll)
 * and supplies the edition-specific progress I/O (`persist` / `loadPosition`)
 * to the shared `useReaderPersistence`. Returns the normalized `ReaderRuntime`.
 *
 * Offline-first: always writes local; authed users also PUT to the server.
 */
export function useEditionReaderSource({
  bookSlug,
  chapterSlug,
  language,
  isAuthenticated,
  showToast,
}: Params): ReaderRuntime {
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
  const editionIdRef = useRef<string | null>(null)
  const bookTitleRef = useRef<string | null>(null)

  const { chapter, loading, chapterError, wordCountRef } = useReaderChapter({
    bookSlug, chapterSlug, language, editionIdRef,
  })

  const { bookmarks, setBookmarks, toggle, remove } = useReaderBookmarks({
    editionIdRef, isAuthenticated, showToast,
  })

  const { bookTitle, chapters, editionId, chaptersLoading } = useReaderBook({
    bookSlug, language, isAuthenticated, editionIdRef, bookTitleRef, totalWordCountRef, setBookmarks,
  })

  const { enableForChapter, loadNext } = useReaderInfiniteScroll({
    bookSlug, language, injectJs, wordCountRef,
  })

  const persist = useCallback((snap: ProgressSnapshot) => {
    const id = editionIdRef.current
    if (!id) return
    saveLocalProgress(id, {
      chapterId: snap.chapterId,
      chapterSlug: snap.chapterSlug,
      locator: `scroll:${snap.chapterSlug}:${snap.scrollOffset}`,
      percent: snap.chapterPercent,
      // null leaves the prior bookPercent in place (resume card would
      // otherwise lose its hint between mount and chapters arriving).
      bookPercent: snap.bookPercent ?? undefined,
      updatedAt: snap.updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    readingProgressApi.updateProgress(id, {
      chapterId: snap.chapterId,
      chapterSlug: snap.chapterSlug,
      progress: snap.chapterPercent,
    }).catch((e) => { console.warn('[progress] save failed', e) })
  }, [isAuthenticated])

  const loadPosition = useCallback(async (slug: string): Promise<SavedPosition> => {
    const id = editionIdRef.current
    let percent: number | null = null
    let offset: number | null = null
    try {
      if (id) {
        const local = await getLocalProgress(id)
        if (local && local.chapterSlug === slug) {
          if (typeof local.percent === 'number') percent = local.percent
          const parsed = parseScrollLocator(local.locator)
          if (parsed && parsed.slug === slug && parsed.offset > 0) offset = parsed.offset
        }
      }
    } catch {}
    // Cross-device fallback — only when local had nothing.
    if (percent == null && offset == null && isAuthenticated && id) {
      try {
        const server = await readingProgressApi.getProgress(id)
        if (server && server.chapterSlug === slug && typeof server.percent === 'number') percent = server.percent
      } catch {}
    }
    // Only restore a mid-chapter percent (skip ~start/~end → leave at top).
    if (percent != null && !(percent > 0.005 && percent < 0.999)) percent = null
    return { offset, percent }
  }, [isAuthenticated])

  const { saveProgress, bumpProgress, onWebViewLoaded } = useReaderPersistence({
    bookKey: editionId,
    chapterSlug,
    chapterId: chapter?.id ?? null,
    injectJs,
    progressRef, scrollOffsetRef, currentChapterSlugRef, bookProgressRef,
    persist, loadPosition,
  })

  return {
    source: { kind: 'edition', id: editionId, idRef: editionIdRef },
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
    onChapterLoaded: () => { if (chapter) enableForChapter(chapter) },
    onRequestNextChapter: loadNext,
    onNavigateChapter: (slug) => router.replace(`/reader/${bookSlug}/${slug}`),
    bookmarks,
    onToggleCurrentBookmark: (slug) => { if (chapter) toggle({ chapter, slug }) },
    onDeleteBookmark: remove,
    bookmarkChapterSlug: (b) => getSlugFromLocator(b.locator),
    explainBookId: editionIdRef.current || undefined,
  }
}
