import { useState, useEffect, useCallback, useRef } from 'react'
import {
  type StoredHighlight,
  type TextAnchor,
  type HighlightColor,
  getHighlightsForEdition,
  getHighlightsForUserBook,
  getHighlightsForChapter,
  saveHighlight,
  deleteHighlight as deleteHighlightFromDB,
  deleteHighlightsByEdition,
  deleteHighlightsByUserBook,
} from '../lib/offlineDb'
import {
  getPublicHighlights,
  getUserBookHighlights,
  createPublicHighlight,
  updatePublicHighlight,
  deletePublicHighlight,
} from '../api/userData'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface UseHighlightsOptions {
  chapterId?: string
  isAuthenticated?: boolean
}

export function useHighlights(editionId?: string, userBookId?: string, options?: UseHighlightsOptions) {
  const { chapterId, isAuthenticated } = options || {}
  const [highlights, setHighlights] = useState<StoredHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const serverSyncedRef = useRef(false)

  const bookId = userBookId || editionId || ''
  const isUserBook = !!userBookId

  // Load highlights: IndexedDB first, then server if authenticated
  useEffect(() => {
    if (!bookId) {
      setLoading(false)
      return
    }

    let cancelled = false
    serverSyncedRef.current = false

    // 1. Load from IndexedDB first (instant)
    const loadLocal = isUserBook
      ? getHighlightsForUserBook(bookId)
      : chapterId
        ? getHighlightsForChapter(bookId, chapterId)
        : getHighlightsForEdition(bookId)

    loadLocal
      .then((localHighlights) => {
        if (cancelled) return
        setHighlights(localHighlights)
      })
      .catch(() => {})

    // 2. If authenticated, fetch from server
    if (isAuthenticated) {
      const fetchServer = isUserBook
        ? getUserBookHighlights(bookId)
        : getPublicHighlights(bookId)

      fetchServer
        .then(async (serverHighlights) => {
          if (cancelled) return
          serverSyncedRef.current = true

          // Convert server highlights to local format
          const converted: StoredHighlight[] = serverHighlights.map((sh) => ({
            id: sh.id,
            editionId: sh.editionId || '',
            chapterId: sh.chapterId || '',
            userBookId: sh.userBookId || undefined,
            userChapterId: sh.userChapterId || undefined,
            anchor: JSON.parse(sh.anchorJson) as TextAnchor,
            color: sh.color as HighlightColor,
            selectedText: sh.selectedText,
            noteText: sh.noteText ?? undefined,
            isPublic: sh.isPublic ?? false,
            likeCount: sh.likeCount ?? 0,
            syncStatus: 'synced' as const,
            version: sh.version,
            createdAt: new Date(sh.createdAt).getTime(),
            updatedAt: new Date(sh.updatedAt).getTime(),
          }))

          // Replace local with server data for this book
          if (isUserBook) {
            await deleteHighlightsByUserBook(bookId)
          } else {
            await deleteHighlightsByEdition(bookId)
          }
          for (const h of converted) {
            await saveHighlight(h)
          }

          // Filter by chapter if needed
          const filtered = chapterId
            ? converted.filter((h) => h.chapterId === chapterId || h.userChapterId === chapterId)
            : converted

          if (!cancelled) setHighlights(filtered)
        })
        .catch(() => {
          // Server unavailable, use local data
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [bookId, chapterId, isAuthenticated, isUserBook])

  const addHighlight = useCallback(
    async (
      anchor: TextAnchor,
      color: HighlightColor,
      selectedText: string,
      options?: { isPublic?: boolean }
    ): Promise<StoredHighlight> => {
      const now = Date.now()
      const isPublic = !!options?.isPublic
      const highlight: StoredHighlight = {
        id: generateId(),
        editionId: isUserBook ? '' : bookId,
        chapterId: anchor.chapterId,
        userBookId: isUserBook ? bookId : undefined,
        userChapterId: isUserBook ? anchor.chapterId : undefined,
        anchor,
        color,
        selectedText,
        isPublic,
        likeCount: 0,
        syncStatus: 'pending',
        version: 1,
        createdAt: now,
        updatedAt: now,
      }

      // If authenticated, create on server first
      if (isAuthenticated) {
        try {
          const serverHighlight = await createPublicHighlight(
            isUserBook
              ? {
                  userBookId: bookId,
                  userChapterId: anchor.chapterId,
                  anchorJson: JSON.stringify(anchor),
                  color,
                  selectedText,
                  isPublic,
                }
              : {
                  editionId: bookId,
                  chapterId: anchor.chapterId,
                  anchorJson: JSON.stringify(anchor),
                  color,
                  selectedText,
                  isPublic,
                }
          )

          highlight.id = serverHighlight.id
          highlight.syncStatus = 'synced'
          highlight.version = serverHighlight.version
          highlight.isPublic = serverHighlight.isPublic ?? isPublic
          highlight.likeCount = serverHighlight.likeCount ?? 0
          highlight.createdAt = new Date(serverHighlight.createdAt).getTime()
          highlight.updatedAt = new Date(serverHighlight.updatedAt).getTime()
        } catch {
          // Continue with local-only
        }
      }

      await saveHighlight(highlight)
      setHighlights((prev) => [highlight, ...prev])
      return highlight
    },
    [bookId, isAuthenticated, isUserBook]
  )

  const updateHighlight = useCallback(
    async (
      id: string,
      updates: { color?: HighlightColor; noteText?: string | null; isPublic?: boolean }
    ): Promise<StoredHighlight | null> => {
      const existing = highlights.find((h) => h.id === id)
      if (!existing) return null

      const updated: StoredHighlight = {
        ...existing,
        ...updates,
        // Convert null to undefined for storage
        noteText: updates.noteText === null ? undefined : (updates.noteText ?? existing.noteText),
        isPublic: updates.isPublic ?? existing.isPublic,
        updatedAt: Date.now(),
        version: existing.version + 1,
        syncStatus: 'pending',
      }

      // If authenticated, update on server
      if (isAuthenticated) {
        try {
          const serverHighlight = await updatePublicHighlight(id, {
            color: updates.color,
            noteText: updates.noteText,
            isPublic: updates.isPublic,
            version: existing.version,
          })

          updated.syncStatus = 'synced'
          updated.version = serverHighlight.version
          updated.isPublic = serverHighlight.isPublic ?? updated.isPublic
          updated.likeCount = serverHighlight.likeCount ?? updated.likeCount
          updated.updatedAt = new Date(serverHighlight.updatedAt).getTime()
        } catch {
          // Continue with local update
        }
      }

      await saveHighlight(updated)
      setHighlights((prev) => prev.map((h) => (h.id === id ? updated : h)))
      return updated
    },
    [highlights, isAuthenticated]
  )

  const removeHighlight = useCallback(
    async (id: string) => {
      // If authenticated, delete from server
      if (isAuthenticated) {
        try {
          await deletePublicHighlight(id)
        } catch {
          // Server unavailable, continue with local delete
        }
      }

      await deleteHighlightFromDB(id)
      setHighlights((prev) => prev.filter((h) => h.id !== id))
    },
    [isAuthenticated]
  )

  const getHighlightsForRange = useCallback(
    (startOffset: number, endOffset: number): StoredHighlight[] => {
      return highlights.filter((h) => {
        const hStart = h.anchor.startOffset
        const hEnd = h.anchor.endOffset
        // Check if ranges overlap
        return hStart < endOffset && hEnd > startOffset
      })
    },
    [highlights]
  )

  return {
    highlights,
    loading,
    addHighlight,
    updateHighlight,
    removeHighlight,
    getHighlightsForRange,
  }
}
