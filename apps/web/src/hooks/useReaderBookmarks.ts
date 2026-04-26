import { useCallback } from 'react'
import { useBookmarks, type Bookmark } from './useBookmarks'
import { useUserBookBookmarks } from './useUserBookBookmarks'
import type { ReaderMode, NormalizedBook } from './useReaderChapter'
import type { Chapter } from '../types/api'

interface Params {
  mode: ReaderMode
  bookSlug: string | undefined
  userBookId: string | undefined
  publicEditionId: string | undefined
  publicChapter: Chapter | null
  book: NormalizedBook | null
  isAuthenticated: boolean
}

export interface UseReaderBookmarksResult {
  bookmarks: Bookmark[]
  isBookmarked: (chapterSlug: string) => boolean
  getBookmarkForChapter: (chapterSlug: string) => Bookmark | undefined
  removeBookmark: (id: string) => void | Promise<unknown>
  addBookmark: (chapterSlug: string, chapterTitle: string) => Promise<unknown>
}

export function useReaderBookmarks({
  mode,
  bookSlug,
  userBookId,
  publicEditionId,
  publicChapter,
  book,
  isAuthenticated,
}: Params): UseReaderBookmarksResult {
  const publicBookmarks = useBookmarks(mode === 'public' ? (bookSlug || '') : '', {
    editionId: publicEditionId,
    isAuthenticated,
  })
  const userBookmarks = useUserBookBookmarks(mode === 'userbook' ? (userBookId || '') : '')

  const active = mode === 'public' ? publicBookmarks : userBookmarks

  const addBookmark = useCallback(
    async (chapterSlug: string, chapterTitle: string) => {
      if (mode === 'public') {
        return publicBookmarks.addBookmark(chapterSlug, chapterTitle, publicChapter?.id)
      }
      const ch = book?.chapters.find(c => c.identifier === chapterSlug)
      return userBookmarks.addBookmark(ch?.id || '', chapterSlug, chapterTitle)
    },
    [mode, publicChapter?.id, book?.chapters, publicBookmarks, userBookmarks],
  )

  return {
    bookmarks: active.bookmarks,
    isBookmarked: active.isBookmarked,
    getBookmarkForChapter: active.getBookmarkForChapter,
    removeBookmark: active.removeBookmark,
    addBookmark,
  }
}
