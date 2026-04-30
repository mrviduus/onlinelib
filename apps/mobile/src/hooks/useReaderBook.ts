import { useEffect, useRef, useState, MutableRefObject } from 'react'
import { createBooksApi, bookmarksApi } from '@textstack/shared'
import type { ChapterSummary, Language, BookmarkDto } from '@textstack/shared'
import { getAllCachedBooks } from '../lib/offlineDb'
import { trackBookOpened } from '../lib/analytics'

type Options = {
  bookSlug: string | undefined
  language: Language
  isAuthenticated: boolean
  /** Screen-owned refs the hook mutates from the API response — kept here so
   * other hooks (progress, highlights, vocab, …) can keep reading them. */
  editionIdRef: MutableRefObject<string | null>
  bookTitleRef: MutableRefObject<string | null>
  totalWordCountRef: MutableRefObject<number>
  /** Initial bookmarks load on auth users — mirrors the current inline behaviour. */
  setBookmarks: (b: BookmarkDto[]) => void
}

/**
 * Resolves edition id + book metadata from `bookSlug`. On network failure
 * falls back to the offline book catalog so a fully downloaded book still
 * picks up its editionId, title, and bookmarks (progress events keep
 * working downstream).
 *
 * Side effects (intentional, mirror the previous inline effect):
 * - Mutates `editionIdRef`, `bookTitleRef`, `totalWordCountRef`
 * - Fires the one-shot `book_opened` analytics event
 * - Loads bookmarks via `setBookmarks` for authed users
 */
export function useReaderBook({
  bookSlug,
  language,
  isAuthenticated,
  editionIdRef,
  bookTitleRef,
  totalWordCountRef,
  setBookmarks,
}: Options) {
  const [bookTitle, setBookTitle] = useState('')
  const [chapters, setChapters] = useState<ChapterSummary[]>([])
  const bookOpenedFiredRef = useRef(false)

  useEffect(() => {
    if (!bookSlug) return
    let cancelled = false
    const api = createBooksApi(language)
    api.getBook(bookSlug)
      .then(b => {
        if (cancelled) return
        editionIdRef.current = b.id
        bookTitleRef.current = b.title
        setBookTitle(b.title)
        if (!bookOpenedFiredRef.current) {
          bookOpenedFiredRef.current = true
          trackBookOpened({ source: 'library', editionId: b.id, language })
        }
        if (b.chapters) {
          setChapters(b.chapters)
          totalWordCountRef.current = b.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
        }
        if (isAuthenticated) {
          bookmarksApi.getBookmarks(b.id)
            .then(res => { if (!cancelled) setBookmarks(res) })
            .catch(() => {})
        }
      })
      .catch(() => {
        getAllCachedBooks().then(books => {
          if (cancelled) return
          const match = books.find(b => b.slug === bookSlug)
          if (match) {
            editionIdRef.current = match.editionId
            bookTitleRef.current = match.title
            setBookTitle(match.title)
          }
        }).catch(() => {})
      })
    return () => { cancelled = true }
  }, [bookSlug, isAuthenticated, language, editionIdRef, bookTitleRef, totalWordCountRef, setBookmarks])

  return { bookTitle, chapters }
}
