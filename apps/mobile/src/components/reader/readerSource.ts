import type { MutableRefObject, RefObject } from 'react'
import type { WebView } from 'react-native-webview'
import type { BookmarkDto } from '@textstack/shared'
import type { ReaderSource, ReaderShellChapter } from './ReaderShell'

/**
 * The single normalized contract for the reader. Both catalog (edition) and
 * user-uploaded books are loaded into ONE `ReaderRuntime` shape by their
 * respective source hooks (`useEditionReaderSource` / `useUserBookReaderSource`),
 * which `<Reader>` then renders. The ONLY differences between the two
 * catalogs (data fetch, FK keying, progress I/O) live behind these types —
 * everything downstream is a single code path, so a fix lands in both at once.
 *
 * This is the structural fix for the recurring "two readers drifted" class of
 * bugs (e.g. user-book lost its percent-restore fallback because the restore
 * effect was copy-pasted and one copy fell behind).
 */

/** Chapter-list entry — drives TOC + book-progress word-count weighting. */
export interface ReaderChapterMeta {
  slug: string
  title: string
  chapterNumber?: number
  wordCount?: number | null
}

/**
 * Immutable snapshot of the live scroll state, handed to a source's
 * `persist()`. Built by `useReaderPersistence` from the live refs so the
 * source layer does pure I/O and never reads refs directly (testable).
 */
export interface ProgressSnapshot {
  chapterId: string
  chapterSlug: string
  /** 0..1 within the active chapter. */
  chapterPercent: number
  /** Pixel scroll offset — builds the `scroll:<slug>:<offset>` resume locator. */
  scrollOffset: number
  /** 0..1 across the whole book, or null until chapters/word-counts resolve. */
  bookPercent: number | null
  /** Epoch ms — LWW key for server + local merge. */
  updatedAt: number
}

/** Saved resume position for a chapter. Either field may be null. Offset is
 *  preferred (pixel-accurate); percent is the coarse fallback. */
export interface SavedPosition {
  offset: number | null
  percent: number | null
}

/**
 * Everything `<Reader>` + `<ReaderShell>` need, normalized across catalogs.
 */
export interface ReaderRuntime {
  // Shell keying / WebView ownership.
  source: ReaderSource
  webViewRef: RefObject<WebView | null>
  injectJs: (js: string) => void

  // Chapter + load state.
  chapter: ReaderShellChapter | null
  loading: boolean
  chapterError: 'offline' | 'notfound' | null
  chapterSlug: string
  htmlChapterSlug?: string

  // Book metadata.
  bookTitle: string | null
  bookTitleRef: MutableRefObject<string | null>
  chapters: ReaderChapterMeta[]
  chaptersLoading: boolean
  wordCount: number

  // Live scroll refs — written by ReaderShell from the WebView 'progress' msg,
  // read by useReaderPersistence to build the ProgressSnapshot.
  progressRef: MutableRefObject<number>
  scrollOffsetRef: MutableRefObject<number>
  currentChapterSlugRef: MutableRefObject<string | null>
  bookProgressRef: MutableRefObject<number | null>
  totalWordCountRef: MutableRefObject<number>

  // Persistence (from the shared useReaderPersistence hook).
  saveProgress: () => void
  bumpProgress: () => void
  /** Called by ReaderShell once the WebView finishes loading — gates the
   *  scroll-restore so it can't race the async saved-position fetch. */
  onWebViewLoaded: () => void

  // Infinite scroll.
  onChapterLoaded: () => void
  onRequestNextChapter: () => void

  // Navigation (path differs per source).
  onNavigateChapter: (slug: string) => void

  // Bookmarks.
  bookmarks: BookmarkDto[]
  onToggleCurrentBookmark: (slug: string) => void
  onDeleteBookmark: (id: string) => void
  bookmarkChapterSlug: (b: BookmarkDto) => string

  // Explain sheet bookId — editionId for catalog, undefined for user-book.
  explainBookId?: string
}

export type { ReaderShellChapter }
