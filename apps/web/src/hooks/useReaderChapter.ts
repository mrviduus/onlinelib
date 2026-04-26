import { useEffect, useRef, useState } from 'react'
import { useApi } from './useApi'
import { useNetworkRecovery } from './useNetworkRecovery'
import { getUserBook, getUserBookChapter } from '../api/userBooks'
import { getCachedChapter, cacheChapter } from '../lib/offlineDb'
import { InvalidContentTypeError } from '../lib/fetchWithRetry'
import type { Chapter, BookDetail } from '../types/api'
import type { TocChapter } from '../components/reader/ReaderTocDrawer'

export type ReaderMode = 'public' | 'userbook'

export interface NormalizedChapter {
  id: string
  chapterNumber: number
  identifier: string
  title: string
  html: string
  wordCount: number | null
  prev: { identifier: string; title: string } | null
  next: { identifier: string; title: string } | null
}

export interface NormalizedBook {
  id: string
  title: string
  totalWordCount?: number | null
  chapters: TocChapter[]
}

interface Params {
  mode: ReaderMode
  bookSlug?: string
  chapterSlug?: string
  userBookId?: string
  userChapterSlug?: string
  isAuthenticated: boolean
}

export interface UseReaderChapterResult {
  chapter: NormalizedChapter | null
  book: NormalizedBook | null
  publicChapter: Chapter | null
  publicBook: BookDetail | null
  loading: boolean
  error: string | null
}

export function useReaderChapter({
  mode,
  bookSlug,
  chapterSlug,
  userBookId,
  userChapterSlug,
  isAuthenticated,
}: Params): UseReaderChapterResult {
  const api = useApi()
  const { markFetchStart, wasAbortedDueToWake } = useNetworkRecovery()

  const [publicChapter, setPublicChapter] = useState<Chapter | null>(null)
  const [publicBook, setPublicBook] = useState<BookDetail | null>(null)
  const [chapter, setChapter] = useState<NormalizedChapter | null>(null)
  const [book, setBook] = useState<NormalizedBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const editionIdRef = useRef<string | null>(null)
  const fetchedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (mode === 'public' && (!bookSlug || !chapterSlug)) return
    if (mode === 'userbook' && (!userBookId || !userChapterSlug || !isAuthenticated)) return

    const fetchKey = mode === 'public'
      ? `public:${bookSlug}:${chapterSlug}`
      : `userbook:${userBookId}:${userChapterSlug}`
    // Already loaded — skip so an isAuthenticated flip (guest creation) doesn't
    // reset state and drop popups mid-interaction.
    if (fetchedKeyRef.current === fetchKey) return

    let cancelled = false
    if (mode === 'public') markFetchStart()

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        if (mode === 'public') {
          const cachedEditionId = editionIdRef.current
          if (cachedEditionId) {
            const cached = await getCachedChapter(cachedEditionId, chapterSlug!)
            if (cached && !cancelled) {
              const rawChapter: Chapter = {
                id: cached.key,
                chapterNumber: 0,
                slug: cached.chapterSlug,
                title: cached.title,
                html: cached.html,
                wordCount: cached.wordCount,
                prev: cached.prev,
                next: cached.next,
              }
              setPublicChapter(rawChapter)
              setChapter({
                id: rawChapter.id,
                chapterNumber: rawChapter.chapterNumber,
                identifier: rawChapter.slug,
                title: rawChapter.title,
                html: rawChapter.html,
                wordCount: rawChapter.wordCount,
                prev: rawChapter.prev ? { identifier: rawChapter.prev.slug, title: rawChapter.prev.title } : null,
                next: rawChapter.next ? { identifier: rawChapter.next.slug, title: rawChapter.next.title } : null,
              })
              try {
                const bk = await api.getBook(bookSlug!)
                if (!cancelled) {
                  setPublicBook(bk)
                  setBook({
                    id: bk.id,
                    title: bk.title,
                    chapters: bk.chapters.map(c => ({
                      id: c.id,
                      identifier: c.slug,
                      title: c.title,
                      chapterNumber: c.chapterNumber,
                    })),
                  })
                }
              } catch {
                // Book fetch failed but chapter from cache - ok
              }
              fetchedKeyRef.current = fetchKey
              setLoading(false)
              return
            }
          }

          const [ch, bk] = await Promise.all([
            api.getChapter(bookSlug!, chapterSlug!),
            api.getBook(bookSlug!),
          ])

          if (cancelled) return

          setPublicChapter(ch)
          setPublicBook(bk)
          editionIdRef.current = bk.id

          setChapter({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            identifier: ch.slug,
            title: ch.title,
            html: ch.html,
            wordCount: ch.wordCount,
            prev: ch.prev ? { identifier: ch.prev.slug, title: ch.prev.title } : null,
            next: ch.next ? { identifier: ch.next.slug, title: ch.next.title } : null,
          })
          setBook({
            id: bk.id,
            title: bk.title,
            chapters: bk.chapters.map(c => ({
              id: c.id,
              identifier: c.slug,
              title: c.title,
              chapterNumber: c.chapterNumber,
            })),
          })

          cacheChapter(bk.id, ch).catch(() => {})
          fetchedKeyRef.current = fetchKey
        } else {
          const [bk, ch] = await Promise.all([
            getUserBook(userBookId!),
            getUserBookChapter(userBookId!, userChapterSlug!),
          ])

          if (cancelled) return

          setChapter({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            identifier: ch.slug || userChapterSlug!,
            title: ch.title,
            html: ch.html,
            wordCount: ch.wordCount,
            prev: ch.previous ? { identifier: ch.previous.slug || String(ch.previous.chapterNumber), title: ch.previous.title } : null,
            next: ch.next ? { identifier: ch.next.slug || String(ch.next.chapterNumber), title: ch.next.title } : null,
          })
          setBook({
            id: bk.id,
            title: bk.title,
            totalWordCount: bk.totalWordCount,
            chapters: bk.chapters.map(c => ({
              id: c.id,
              identifier: c.slug || String(c.chapterNumber),
              title: c.title,
              chapterNumber: c.chapterNumber,
              wordCount: c.wordCount,
            })),
          })
          fetchedKeyRef.current = fetchKey
        }
      } catch (err) {
        if (cancelled) return
        if (mode === 'public' && wasAbortedDueToWake()) {
          fetchData()
          return
        }
        if (err instanceof InvalidContentTypeError) {
          setError('Chapter not found. The book may have been removed.')
        } else {
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [mode, bookSlug, chapterSlug, userBookId, userChapterSlug, isAuthenticated, api, markFetchStart, wasAbortedDueToWake])

  return { chapter, book, publicChapter, publicBook, loading, error }
}
