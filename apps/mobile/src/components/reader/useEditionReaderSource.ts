import { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import { readingProgressApi, parseScrollLocator, chapterIdForSlug } from '@textstack/shared'
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

  // The chapter list, in a ref so `persist` can read it without being rebuilt on every change —
  // it is handed to useReaderPersistence, which keys effects on its identity.
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters

  const persist = useCallback((snap: ProgressSnapshot) => {
    const id = editionIdRef.current
    if (!id) return

    // The chapter the reader is actually in, not the one the URL named.
    //
    // Infinite scroll appends the next chapter into the same document without renavigating, so
    // the route chapter — and the id derived from it — stops moving while the locator follows the
    // reader. The server has no slug column: it derives `chapterSlug` by joining this id to the
    // chapters table. So a stale id here made the row disagree with its own locator, and resume
    // believed the id. A reader who crossed into chapter two, left, and pressed Continue was sent
    // back to chapter one, where the reader's first automatic save destroyed their place.
    //
    // Falls back to the route id when the slug names no known chapter: a position saved against a
    // slightly stale chapter is worth more than a position not saved at all.
    const chapterId = chapterIdForSlug(chaptersRef.current, snap.chapterSlug) ?? snap.chapterId
    saveLocalProgress(id, {
      // '' rather than null: getAllLocalProgress() validates this field as a
      // string and would drop the whole record otherwise. The local row is
      // keyed and resumed by slug; the id only matters to the server.
      chapterId: chapterId ?? '',
      chapterSlug: snap.chapterSlug,
      locator: `scroll:${snap.chapterSlug}:${snap.scrollOffset}`,
      percent: snap.chapterPercent,
      // null leaves the prior bookPercent in place (resume card would
      // otherwise lose its hint between mount and chapters arriving).
      bookPercent: snap.bookPercent ?? undefined,
      updatedAt: snap.updatedAt,
    }).catch(() => {})

    if (!isAuthenticated) return
    // The server row is keyed by chapter id. An offline-cached chapter has no
    // id to give, so there is nothing to send — the local write above is the
    // record, and useReaderPersistence repeats the save once an id appears.
    if (!chapterId) return
    readingProgressApi.updateProgress(id, {
      chapterId,
      chapterSlug: snap.chapterSlug,
      // Book-wide, matching ReadingProgress.Percent's declared unit. This used
      // to send the chapter fraction — which hits 1.0 at the bottom of every
      // chapter — while web sent a book fraction into the same column.
      // `bookPercent` is null only before the chapter list resolves; the
      // chapter fraction is a strictly better guess than nothing there.
      progress: snap.bookPercent ?? snap.chapterPercent,
      scrollOffset: snap.scrollOffset,
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
    //
    // Position comes from the LOCATOR, never from the percent: the stored
    // percent spans the whole book, so applying it as a within-chapter scroll
    // fraction would drop the reader at 42% of the current chapter for a book
    // they are 42% through. The locator is chapter-scoped and exact.
    if (offset == null && isAuthenticated && id) {
      try {
        const server = await readingProgressApi.getProgress(id)
        const parsed = parseScrollLocator(server?.locator)
        if (parsed && parsed.slug === slug && parsed.offset > 0) offset = parsed.offset
      } catch {}
    }
    // Only restore a mid-chapter percent (skip ~start/~end → leave at top).
    if (percent != null && !(percent > 0.005 && percent < 0.999)) percent = null
    return { offset, percent }
  }, [isAuthenticated])

  const { saveProgress, bumpProgress, onWebViewLoaded, onRestoreLanded } = useReaderPersistence({
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
    saveProgress, bumpProgress, onWebViewLoaded, onRestoreLanded,
    onChapterLoaded: () => { if (chapter) enableForChapter(chapter) },
    onRequestNextChapter: loadNext,
    onNavigateChapter: (slug) => router.replace(`/reader/${bookSlug}/${slug}`),
    bookmarks,
    onToggleCurrentBookmark: (slug) => { if (chapter) toggle({ chapter, slug }) },
    onDeleteBookmark: remove,
    bookmarkChapterSlug: (b) => getSlugFromLocator(b.locator),
    explainBookId: editionIdRef.current || undefined,
    askTarget: editionId ? { kind: 'edition', id: editionId } : undefined,
  }
}
