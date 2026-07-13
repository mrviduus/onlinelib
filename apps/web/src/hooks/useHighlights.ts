import { useState, useEffect, useCallback, useRef } from 'react'
import { isPdfAnchor } from '@textstack/shared'
import {
  type StoredHighlight,
  type HighlightAnchor,
  type HighlightColor,
  getHighlightsForEdition,
  getHighlightsForUserBook,
  saveHighlight,
  deleteHighlight as deleteHighlightFromDB,
} from '../lib/offlineDb'
import {
  getPublicHighlights,
  getUserBookHighlights,
  createPublicHighlight,
  updatePublicHighlight,
  deletePublicHighlight,
} from '../api/userData'
import { emitDataChange } from '../lib/dataEvents'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface UseHighlightsOptions {
  isAuthenticated?: boolean
}

export function useHighlights(editionId?: string, userBookId?: string, options?: UseHighlightsOptions) {
  const { isAuthenticated } = options || {}
  const [highlights, setHighlights] = useState<StoredHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const serverSyncedRef = useRef(false)

  const bookId = userBookId || editionId || ''
  const isUserBook = !!userBookId

  // Load highlights: IndexedDB first, then server if authenticated.
  // We intentionally do NOT filter by chapter — the scroll reader mounts
  // multiple chapters and every visible chapter needs its highlights.
  useEffect(() => {
    if (!bookId) {
      setLoading(false)
      return
    }

    let cancelled = false
    serverSyncedRef.current = false

    const loadLocal = isUserBook
      ? getHighlightsForUserBook(bookId)
      : getHighlightsForEdition(bookId)

    loadLocal
      .then((localHighlights) => {
        if (cancelled) return
        setHighlights(localHighlights)
      })
      .catch(() => {})

    if (isAuthenticated) {
      const fetchServer = isUserBook
        ? getUserBookHighlights(bookId)
        : getPublicHighlights(bookId)

      fetchServer
        .then(async (serverHighlights) => {
          if (cancelled) return
          serverSyncedRef.current = true

          const converted: StoredHighlight[] = serverHighlights.map((sh) => ({
            id: sh.id,
            editionId: sh.editionId || '',
            chapterId: sh.chapterId || '',
            userBookId: sh.userBookId || undefined,
            userChapterId: sh.userChapterId || undefined,
            anchor: JSON.parse(sh.anchorJson) as HighlightAnchor,
            color: sh.color as HighlightColor,
            selectedText: sh.selectedText,
            noteText: sh.noteText ?? undefined,
            syncStatus: 'synced' as const,
            version: sh.version,
            createdAt: new Date(sh.createdAt).getTime(),
            updatedAt: new Date(sh.updatedAt).getTime(),
          }))

          // Reconcile, don't wipe-and-rebuild. A prior transient window
          // between deleteByEdition and saveAll could leave IndexedDB empty
          // if the user navigated during sync — next cold start would see
          // zero highlights.
          const serverIds = new Set(converted.map((h) => h.id))
          for (const h of converted) await saveHighlight(h)
          const existingLocal = isUserBook
            ? await getHighlightsForUserBook(bookId)
            : await getHighlightsForEdition(bookId)
          for (const local of existingLocal) {
            if (!serverIds.has(local.id) && local.syncStatus === 'synced') {
              await deleteHighlightFromDB(local.id)
            }
          }

          if (!cancelled) setHighlights(converted)
        })
        .catch(() => {
          // Server unavailable, keep local data.
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
  }, [bookId, isAuthenticated, isUserBook])

  const addHighlight = useCallback(
    async (
      anchor: HighlightAnchor,
      color: HighlightColor,
      selectedText: string
    ): Promise<StoredHighlight> => {
      const now = Date.now()
      // PDF (Original-layout) anchors are chapterless — no chapterId /
      // userChapterId (backend S-a accepts null). Reflow anchors carry a
      // chapter-relative TextAnchor.
      const isPdf = isPdfAnchor(anchor)
      const chapterId = isPdf ? '' : anchor.chapterId
      const highlight: StoredHighlight = {
        id: generateId(),
        editionId: isUserBook ? '' : bookId,
        chapterId,
        userBookId: isUserBook ? bookId : undefined,
        userChapterId: isUserBook && !isPdf ? chapterId : undefined,
        anchor,
        color,
        selectedText,
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
                  // Omit userChapterId for PDF highlights (chapterless).
                  userChapterId: isPdf ? undefined : chapterId,
                  anchorJson: JSON.stringify(anchor),
                  color,
                  selectedText,
                }
              : {
                  editionId: bookId,
                  chapterId,
                  anchorJson: JSON.stringify(anchor),
                  color,
                  selectedText,
                }
          )

          highlight.id = serverHighlight.id
          highlight.syncStatus = 'synced'
          highlight.version = serverHighlight.version
          highlight.createdAt = new Date(serverHighlight.createdAt).getTime()
          highlight.updatedAt = new Date(serverHighlight.updatedAt).getTime()
        } catch {
          // Continue with local-only
        }
      }

      await saveHighlight(highlight)
      setHighlights((prev) => [highlight, ...prev])
      emitDataChange('highlights')
      return highlight
    },
    [bookId, isAuthenticated, isUserBook]
  )

  const updateHighlight = useCallback(
    async (
      id: string,
      updates: { color?: HighlightColor; noteText?: string | null }
    ): Promise<StoredHighlight | null> => {
      const existing = highlights.find((h) => h.id === id)
      if (!existing) return null

      const updated: StoredHighlight = {
        ...existing,
        ...updates,
        // Convert null to undefined for storage
        noteText: updates.noteText === null ? undefined : (updates.noteText ?? existing.noteText),
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
            version: existing.version,
          })

          updated.syncStatus = 'synced'
          updated.version = serverHighlight.version
          updated.updatedAt = new Date(serverHighlight.updatedAt).getTime()
        } catch {
          // Continue with local update
        }
      }

      await saveHighlight(updated)
      setHighlights((prev) => prev.map((h) => (h.id === id ? updated : h)))
      emitDataChange('highlights')
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
      emitDataChange('highlights')
    },
    [isAuthenticated]
  )

  const getHighlightsForRange = useCallback(
    (startOffset: number, endOffset: number): StoredHighlight[] => {
      return highlights.filter((h) => {
        // PDF (quad-rect) anchors have no text offsets — they're never located
        // by range overlap. Skip so they don't corrupt reflow range queries.
        if (isPdfAnchor(h.anchor)) return false
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
