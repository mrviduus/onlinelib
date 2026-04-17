import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { createBooksApi } from '@textstack/shared'
import type { BookDetail } from '@textstack/shared'
import {
  cacheChapter,
  setCachedBookMeta,
  updateCachedChapterCount,
  getCachedBookMeta,
  deleteCachedBook,
  isBookFullyCached,
  getAllCachedBooks,
  type CachedBookMeta,
} from '../lib/offlineDb'
import { useAuth } from './AuthContext'

export type DownloadStatus = 'idle' | 'downloading' | 'complete' | 'error' | 'cancelled'

export interface DownloadInfo {
  editionId: string
  bookSlug: string
  title: string
  language: string
  totalChapters: number
  downloadedChapters: number
  failedChapters: number
  /**
   * Slugs of chapters that still haven't been cached successfully after the
   * per-chapter retry budget. Kept around so the user can tap "Retry" and we
   * only re-fetch the missing ones (P1-5).
   */
  failedChapterSlugs: string[]
  status: DownloadStatus
  errorMessage?: string
}

interface DownloadContextValue {
  downloads: Map<string, DownloadInfo>
  cachedBooks: CachedBookMeta[]
  startDownload: (book: BookDetail, language: string) => Promise<void>
  retryFailed: (editionId: string) => Promise<void>
  cancelDownload: (editionId: string) => void
  removeDownload: (editionId: string) => Promise<void>
  isDownloading: (editionId: string) => boolean
  isCached: (editionId: string) => Promise<boolean>
  refreshCachedBooks: () => Promise<void>
}

const DownloadContext = createContext<DownloadContextValue>({
  downloads: new Map(),
  cachedBooks: [],
  startDownload: async () => {},
  retryFailed: async () => {},
  cancelDownload: () => {},
  removeDownload: async () => {},
  isDownloading: () => false,
  isCached: async () => false,
  refreshCachedBooks: async () => {},
})

export function useDownload() {
  return useContext(DownloadContext)
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [downloads, setDownloads] = useState<Map<string, DownloadInfo>>(new Map())
  const [cachedBooks, setCachedBooks] = useState<CachedBookMeta[]>([])
  const cancelledRef = useRef<Set<string>>(new Set())
  const { isAuthenticated } = useAuth()
  const wasAuthenticatedRef = useRef(isAuthenticated)

  // When the auth state flips from true → false (explicit sign out OR a
  // terminal refresh failure emitted by the API layer), cancel every
  // in-flight download and drop the in-memory download/cached-books
  // state so the UI doesn't show stale entries from the previous
  // session. Disk cache is preserved — it's keyed by editionId and
  // belongs to the device, not the user (R-5).
  useEffect(() => {
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      for (const editionId of downloads.keys()) {
        cancelledRef.current.add(editionId)
      }
      setDownloads(new Map())
      setCachedBooks([])
    }
    wasAuthenticatedRef.current = isAuthenticated
    // `downloads` intentionally omitted — we only care about the
    // auth transition, not every mutation of the map. Reading .keys()
    // from the closure is fine because React batches state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const refreshCachedBooks = useCallback(async () => {
    const books = await getAllCachedBooks()
    setCachedBooks(books)
  }, [])

  const updateDownload = useCallback((editionId: string, update: Partial<DownloadInfo>) => {
    setDownloads(prev => {
      const next = new Map(prev)
      const current = next.get(editionId)
      if (current) {
        next.set(editionId, { ...current, ...update })
      }
      return next
    })
  }, [])

  /**
   * Fetch + cache a single chapter with up to 2 retries and exponential
   * backoff (P1-5). Returns true on success, false if we gave up. Callers
   * aggregate success/failure to update the UI counters in one place.
   */
  const downloadChapter = useCallback(async (
    api: ReturnType<typeof createBooksApi>,
    editionId: string,
    bookSlug: string,
    chapterSlug: string,
  ): Promise<boolean> => {
    const MAX_ATTEMPTS = 3
    let delay = 400
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current.has(editionId)) return false
      try {
        const chapter = await api.getChapter(bookSlug, chapterSlug)
        await cacheChapter(editionId, chapter)
        return true
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) {
          console.warn(`Chapter ${chapterSlug} failed after ${MAX_ATTEMPTS} attempts:`, err)
          return false
        }
        // Linear-ish backoff: 400ms → 1200ms → 2400ms. Enough to ride out a
        // brief 502/connection reset without making the total download take
        // forever if every chapter is retrying.
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * 2, 3000)
      }
    }
    return false
  }, [])

  const startDownload = useCallback(async (book: BookDetail, language: string) => {
    const editionId = book.id
    cancelledRef.current.delete(editionId)

    const info: DownloadInfo = {
      editionId,
      bookSlug: book.slug,
      title: book.title,
      language,
      totalChapters: book.chapters.length,
      downloadedChapters: 0,
      failedChapters: 0,
      failedChapterSlugs: [],
      status: 'downloading',
    }

    setDownloads(prev => new Map(prev).set(editionId, info))

    // Save book meta
    await setCachedBookMeta({
      editionId,
      slug: book.slug,
      title: book.title,
      coverPath: book.coverPath,
      totalChapters: book.chapters.length,
      cachedChapters: 0,
      cachedAt: Date.now(),
    })

    const api = createBooksApi(language)
    let downloaded = 0
    const failedSlugs: string[] = []

    for (const ch of book.chapters) {
      if (cancelledRef.current.has(editionId)) {
        updateDownload(editionId, { status: 'cancelled' })
        return
      }

      const ok = await downloadChapter(api, editionId, book.slug, ch.slug)
      if (ok) downloaded++
      else failedSlugs.push(ch.slug)

      await updateCachedChapterCount(editionId, downloaded)
      updateDownload(editionId, {
        downloadedChapters: downloaded,
        failedChapters: failedSlugs.length,
        failedChapterSlugs: [...failedSlugs],
      })

      // Small delay between requests so a large book doesn't hammer the API.
      await new Promise(r => setTimeout(r, 100))
    }

    const status: DownloadStatus = failedSlugs.length > 0 ? 'error' : 'complete'
    updateDownload(editionId, {
      status,
      errorMessage: failedSlugs.length > 0
        ? `${failedSlugs.length} chapter${failedSlugs.length === 1 ? '' : 's'} failed. Tap Retry to finish the download.`
        : undefined,
    })
    await refreshCachedBooks()
  }, [updateDownload, refreshCachedBooks, downloadChapter])

  /**
   * Retry just the chapters we failed to cache on the previous run, rather
   * than re-downloading the whole book. Resets failure state, keeps the
   * existing downloaded count (P1-5).
   */
  const retryFailed = useCallback(async (editionId: string) => {
    const current = downloads.get(editionId)
    if (!current) return
    const slugsToRetry = [...current.failedChapterSlugs]
    if (slugsToRetry.length === 0) return

    cancelledRef.current.delete(editionId)
    updateDownload(editionId, {
      status: 'downloading',
      failedChapters: 0,
      failedChapterSlugs: [],
      errorMessage: undefined,
    })

    const api = createBooksApi(current.language)
    let downloaded = current.downloadedChapters
    const stillFailed: string[] = []

    for (const slug of slugsToRetry) {
      if (cancelledRef.current.has(editionId)) {
        updateDownload(editionId, { status: 'cancelled' })
        return
      }
      const ok = await downloadChapter(api, editionId, current.bookSlug, slug)
      if (ok) downloaded++
      else stillFailed.push(slug)

      await updateCachedChapterCount(editionId, downloaded)
      updateDownload(editionId, {
        downloadedChapters: downloaded,
        failedChapters: stillFailed.length,
        failedChapterSlugs: [...stillFailed],
      })
      await new Promise(r => setTimeout(r, 100))
    }

    const status: DownloadStatus = stillFailed.length > 0 ? 'error' : 'complete'
    updateDownload(editionId, {
      status,
      errorMessage: stillFailed.length > 0
        ? `${stillFailed.length} chapter${stillFailed.length === 1 ? '' : 's'} still failing. Check your connection and retry.`
        : undefined,
    })
    await refreshCachedBooks()
  }, [downloads, updateDownload, refreshCachedBooks, downloadChapter])

  const cancelDownload = useCallback((editionId: string) => {
    cancelledRef.current.add(editionId)
  }, [])

  const removeDownload = useCallback(async (editionId: string) => {
    await deleteCachedBook(editionId)
    setDownloads(prev => {
      const next = new Map(prev)
      next.delete(editionId)
      return next
    })
    await refreshCachedBooks()
  }, [refreshCachedBooks])

  const isDownloading = useCallback((editionId: string) => {
    return downloads.get(editionId)?.status === 'downloading'
  }, [downloads])

  const isCached = useCallback(async (editionId: string) => {
    return isBookFullyCached(editionId)
  }, [])

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        cachedBooks,
        startDownload,
        retryFailed,
        cancelDownload,
        removeDownload,
        isDownloading,
        isCached,
        refreshCachedBooks,
      }}
    >
      {children}
    </DownloadContext.Provider>
  )
}
