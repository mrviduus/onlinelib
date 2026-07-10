import { useState, useEffect, useCallback } from 'react'
import {
  getUserBookBookmarks,
  createUserBookBookmark,
  deleteUserBookBookmark,
} from '../api/userBooks'
import { parsePdfPageLocator } from '../lib/pdfProgress'
import type { Bookmark } from './useBookmarks'

export function useUserBookBookmarks(bookId: string) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  // Load bookmarks from server on mount
  useEffect(() => {
    if (!bookId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    getUserBookBookmarks(bookId)
      .then((serverBookmarks) => {
        if (cancelled) return
        setBookmarks(
          serverBookmarks.map((b) => ({
            id: b.id,
            bookId,
            chapterSlug: b.chapterSlug || b.locator.replace('chapter:', ''),
            chapterTitle: b.title || '',
            chapterId: b.chapterId ?? undefined,
            page: parsePdfPageLocator(b.locator),
            createdAt: new Date(b.createdAt).getTime(),
          }))
        )
      })
      .catch(() => {
        // Server unavailable
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  const addBookmark = useCallback(
    async (chapterId: string, chapterSlug: string | null, title: string) => {
      if (!bookId) return null

      const slug = chapterSlug || ''

      // Check if already bookmarked
      const existing = bookmarks.find((b) => b.chapterSlug === slug)
      if (existing) return existing

      try {
        const locator = `chapter:${slug}`
        const serverBookmark = await createUserBookBookmark(bookId, {
          chapterId,
          locator,
          title,
        })

        const bookmark: Bookmark = {
          id: serverBookmark.id,
          bookId,
          chapterSlug: serverBookmark.chapterSlug || slug,
          chapterTitle: serverBookmark.title || title,
          chapterId: serverBookmark.chapterId ?? undefined,
          createdAt: new Date(serverBookmark.createdAt).getTime(),
        }

        setBookmarks((prev) => [bookmark, ...prev])
        return bookmark
      } catch {
        return null
      }
    },
    [bookId, bookmarks]
  )

  // --- Page bookmarks (Original-layout PDF). A chapterless PDF has no chapter to
  // key on, so the bookmark is anchored to a 1-based page via `locator: page:<N>`
  // and `chapterId: null` (backend contract). Kept parallel to the chapter API so
  // the same drawer + top-bar toggle can drive either. ---
  const addPageBookmark = useCallback(
    async (page: number) => {
      if (!bookId || !Number.isFinite(page) || page < 1) return null

      const existing = bookmarks.find((b) => b.page === page)
      if (existing) return existing

      try {
        const title = `Page ${page}`
        const serverBookmark = await createUserBookBookmark(bookId, {
          chapterId: null,
          locator: `page:${page}`,
          title,
        })

        const bookmark: Bookmark = {
          id: serverBookmark.id,
          bookId,
          chapterSlug: '',
          chapterTitle: serverBookmark.title || title,
          chapterId: serverBookmark.chapterId ?? undefined,
          page: parsePdfPageLocator(serverBookmark.locator) ?? page,
          createdAt: new Date(serverBookmark.createdAt).getTime(),
        }

        setBookmarks((prev) => [bookmark, ...prev])
        return bookmark
      } catch {
        return null
      }
    },
    [bookId, bookmarks]
  )

  const isPageBookmarked = useCallback(
    (page: number) => bookmarks.some((b) => b.page === page),
    [bookmarks]
  )

  const getPageBookmark = useCallback(
    (page: number) => bookmarks.find((b) => b.page === page),
    [bookmarks]
  )

  const removeBookmark = useCallback(
    async (id: string) => {
      if (!bookId) return

      try {
        await deleteUserBookBookmark(bookId, id)
        setBookmarks((prev) => prev.filter((b) => b.id !== id))
      } catch {
        // Server unavailable
      }
    },
    [bookId]
  )

  const isBookmarked = useCallback(
    (chapterSlug: string) => {
      return bookmarks.some((b) => b.chapterSlug === chapterSlug)
    },
    [bookmarks]
  )

  const getBookmarkForChapter = useCallback(
    (chapterSlug: string) => {
      return bookmarks.find((b) => b.chapterSlug === chapterSlug)
    },
    [bookmarks]
  )

  return {
    bookmarks,
    loading,
    addBookmark,
    addPageBookmark,
    isPageBookmarked,
    getPageBookmark,
    removeBookmark,
    isBookmarked,
    getBookmarkForChapter,
  }
}
