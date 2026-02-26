import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
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

export type DownloadStatus = 'idle' | 'downloading' | 'complete' | 'error' | 'cancelled'

export interface DownloadInfo {
  editionId: string
  bookSlug: string
  title: string
  totalChapters: number
  downloadedChapters: number
  failedChapters: number
  status: DownloadStatus
  errorMessage?: string
}

interface DownloadContextValue {
  downloads: Map<string, DownloadInfo>
  cachedBooks: CachedBookMeta[]
  startDownload: (book: BookDetail, language: string) => Promise<void>
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

  const startDownload = useCallback(async (book: BookDetail, language: string) => {
    const editionId = book.id
    cancelledRef.current.delete(editionId)

    const info: DownloadInfo = {
      editionId,
      bookSlug: book.slug,
      title: book.title,
      totalChapters: book.chapters.length,
      downloadedChapters: 0,
      failedChapters: 0,
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
    let failed = 0

    for (const ch of book.chapters) {
      if (cancelledRef.current.has(editionId)) {
        updateDownload(editionId, { status: 'cancelled' })
        return
      }

      try {
        const chapter = await api.getChapter(book.slug, ch.slug)
        await cacheChapter(editionId, chapter)
        downloaded++
      } catch {
        failed++
      }

      await updateCachedChapterCount(editionId, downloaded)
      updateDownload(editionId, {
        downloadedChapters: downloaded,
        failedChapters: failed,
      })

      // Small delay between requests
      await new Promise(r => setTimeout(r, 100))
    }

    const status: DownloadStatus = failed > 0 ? 'error' : 'complete'
    updateDownload(editionId, { status })
    await refreshCachedBooks()
  }, [updateDownload, refreshCachedBooks])

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
