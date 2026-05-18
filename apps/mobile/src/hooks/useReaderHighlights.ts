import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react'
import { highlightsApi } from '@textstack/shared'
import type { PublicHighlight } from '@textstack/shared'
import { highlightCache, userBookHighlightCache } from '../lib/readerOfflineCache'

type Selection = { text: string; anchor?: unknown } | null
type ToastFn = (t: { message: string; variant: 'error' | 'success' | 'info' }) => void
type User = { id: string } | null | undefined

/** Lightweight chapter shape — both Chapter and UserChapter satisfy it.
 *  We only need the id for highlight payload + chapter-match filtering. */
type ChapterLike = { id: string }

type Options = {
  /** Edition mode — pass editionId + editionIdRef. */
  editionId?: string | null
  editionIdRef?: MutableRefObject<string | null>
  /** User-book mode — pass userBookId + userBookIdRef. Mutually exclusive with editionId. */
  userBookId?: string | null
  userBookIdRef?: MutableRefObject<string | null>
  user: User
  isAuthenticated: boolean
  /** Either edition chapterId OR userChapterId — used for cache filtering. */
  chapterId: string | null | undefined
  injectJs: (js: string) => void
  showToast: ToastFn
}

/** Cache facade — both stores have identical (get, set) shape. */
function pickCache(userBookMode: boolean) {
  return userBookMode ? userBookHighlightCache : highlightCache
}

/** Matches highlights against the current chapter regardless of edition vs
 *  user-book mode — the backend stores them on different FK columns
 *  (chapterId / userChapterId). */
function matchesChapter(h: PublicHighlight, chapterId: string): boolean {
  return h.chapterId === chapterId || h.userChapterId === chapterId
}

/**
 * One hook covers both edition and user-book reader. Mode is implicit:
 *   - `editionId` set     → loads /me/highlights/{editionId}, creates with editionId+chapterId
 *   - `userBookId` set    → loads /me/highlights/userbook/{userBookId}, creates with userBookId+userChapterId
 *
 * Cache, load + paint, optimistic create/remove, reactive re-paint, color
 * change, note save — all shared.
 */
export function useReaderHighlights({
  editionId,
  editionIdRef,
  userBookId,
  userBookIdRef,
  user,
  isAuthenticated,
  chapterId,
  injectJs,
  showToast,
}: Options) {
  const userBookMode = !!userBookId
  // Stable "current book id" — `editionId` for edition mode, `userBookId`
  // for user-book mode. Drives cache key + load API choice.
  const bookId = userBookMode ? userBookId : editionId
  const cache = pickCache(userBookMode)

  const [editingHighlight, setEditingHighlight] = useState<PublicHighlight | null>(null)
  const highlightsRef = useRef<PublicHighlight[]>([])
  // Bump on every ref mutation (create/remove). A useEffect below re-injects
  // the full set of renderHighlight calls so the WebView mirrors highlightsRef
  // even if an inline injectJs missed (e.g. WebView still loading at the time).
  const [highlightsVersion, setHighlightsVersion] = useState(0)
  const bumpHighlights = useCallback(() => setHighlightsVersion(v => v + 1), [])
  const skipFirstHighlightsRef = useRef(true)
  useEffect(() => {
    if (skipFirstHighlightsRef.current) {
      skipFirstHighlightsRef.current = false
      return
    }
    const t = setTimeout(() => {
      for (const h of highlightsRef.current) {
        if (chapterId && !matchesChapter(h, chapterId)) continue
        injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
      }
    }, 120)
    return () => clearTimeout(t)
  }, [highlightsVersion, chapterId, injectJs])

  // Load + paint existing highlights when chapter changes. Cache-first paint
  // for offline survival; API refresh overwrites. Cache keyed per-user so
  // device-shared sign-ins can't leak another account's highlights.
  useEffect(() => {
    if (!isAuthenticated || !bookId || !chapterId) return
    let cancelled = false

    const paint = (list: PublicHighlight[]) => {
      const chapterHighlights = list.filter(h => matchesChapter(h, chapterId))
      highlightsRef.current = chapterHighlights
      for (const h of chapterHighlights) {
        injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
      }
    }

    const uid = user?.id
    if (uid) {
      cache.get(uid, bookId).then(cached => {
        if (!cancelled && cached) paint(cached)
      })
    }

    const loader = userBookMode
      ? highlightsApi.getUserBookHighlights(bookId)
      : highlightsApi.getHighlights(bookId)
    loader
      .then(highlights => {
        if (cancelled) return
        paint(highlights)
        if (uid) cache.set(uid, bookId, highlights)
      })
      .catch(() => { /* offline — cache paint already rendered */ })
    return () => { cancelled = true }
  }, [isAuthenticated, chapterId, user?.id, bookId, userBookMode, cache, injectJs])

  /** Sync handle for callbacks — picks the right ref based on mode. */
  const currentBookId = useCallback((): string | null => {
    if (userBookMode) return userBookIdRef?.current ?? null
    return editionIdRef?.current ?? null
  }, [userBookMode, userBookIdRef, editionIdRef])

  const create = useCallback(
    async ({ color, selection, chapter }: { color: string; selection: NonNullable<Selection>; chapter: ChapterLike }) => {
      const bId = currentBookId()
      if (!bId) return
      try {
        const anchorJson = selection.anchor ? JSON.stringify(selection.anchor) : JSON.stringify({ exact: selection.text })
        const payload = userBookMode
          ? { userBookId: bId, userChapterId: chapter.id, anchorJson, color, selectedText: selection.text }
          : { editionId: bId, chapterId: chapter.id, anchorJson, color, selectedText: selection.text }
        const hl = await highlightsApi.createHighlight(payload)
        injectJs(`renderHighlight(${JSON.stringify(hl.id)}, ${JSON.stringify(anchorJson)}, ${JSON.stringify(color)}, ${JSON.stringify(selection.text)})`)
        highlightsRef.current = [...highlightsRef.current, hl]
        bumpHighlights()
        const uid = user?.id
        if (uid) {
          cache.get(uid, bId).then(prev => {
            cache.set(uid, bId, [...(prev || []), hl])
          })
        }
      } catch (e) {
        console.warn('Failed to create highlight:', e)
        showToast({ message: 'Could not add highlight. Try again.', variant: 'error' })
      }
    },
    [currentBookId, userBookMode, cache, injectJs, showToast, user?.id, bumpHighlights]
  )

  const saveNote = useCallback(
    async (id: string, note: string) => {
      try {
        const updated = await highlightsApi.updateHighlight(id, { noteText: note || null })
        highlightsRef.current = highlightsRef.current.map(h => h.id === id ? updated : h)
        const uid = user?.id
        const bId = currentBookId()
        if (uid && bId) {
          cache.get(uid, bId).then(prev => {
            if (!prev) return
            cache.set(uid, bId, prev.map(h => h.id === id ? updated : h))
          })
        }
      } catch (e) {
        console.warn('Highlight note save failed:', e)
        showToast({ message: 'Could not save note. Try again.', variant: 'error' })
      }
    },
    [currentBookId, cache, showToast, user?.id]
  )

  const updateColor = useCallback(
    async (id: string, color: string) => {
      // Optimistic — paint the new color in the WebView, push to server,
      // roll back the cache state on failure.
      const prevHl = highlightsRef.current.find(h => h.id === id)
      if (!prevHl) return
      injectJs(`removeHighlight(${JSON.stringify(id)})`)
      injectJs(`renderHighlight(${JSON.stringify(id)}, ${JSON.stringify(prevHl.anchorJson)}, ${JSON.stringify(color)}, ${JSON.stringify(prevHl.selectedText)})`)
      try {
        const updated = await highlightsApi.updateHighlight(id, { color })
        highlightsRef.current = highlightsRef.current.map(h => h.id === id ? updated : h)
        bumpHighlights()
        const uid = user?.id
        const bId = currentBookId()
        if (uid && bId) {
          cache.get(uid, bId).then(prev => {
            if (!prev) return
            cache.set(uid, bId, prev.map(h => h.id === id ? updated : h))
          })
        }
      } catch (e) {
        console.warn('Highlight color update failed:', e)
        // Rollback paint
        injectJs(`removeHighlight(${JSON.stringify(id)})`)
        injectJs(`renderHighlight(${JSON.stringify(id)}, ${JSON.stringify(prevHl.anchorJson)}, ${JSON.stringify(prevHl.color)}, ${JSON.stringify(prevHl.selectedText)})`)
        showToast({ message: 'Could not change color. Try again.', variant: 'error' })
      }
    },
    [currentBookId, cache, injectJs, showToast, user?.id, bumpHighlights]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await highlightsApi.deleteHighlight(id)
        injectJs(`removeHighlight(${JSON.stringify(id)})`)
        highlightsRef.current = highlightsRef.current.filter(h => h.id !== id)
        bumpHighlights()
        const uid = user?.id
        const bId = currentBookId()
        if (uid && bId) {
          cache.get(uid, bId).then(prev => {
            if (!prev) return
            cache.set(uid, bId, prev.filter(h => h.id !== id))
          })
        }
      } catch (e) {
        console.warn('Highlight delete failed:', e)
        showToast({ message: 'Could not delete highlight. Try again.', variant: 'error' })
      }
    },
    [currentBookId, cache, injectJs, showToast, user?.id, bumpHighlights]
  )

  return {
    highlightsRef,
    editingHighlight,
    setEditingHighlight,
    create,
    saveNote,
    updateColor,
    remove,
  }
}
