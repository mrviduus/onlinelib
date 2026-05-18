import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react'
import { highlightsApi } from '@textstack/shared'
import type { Chapter, PublicHighlight } from '@textstack/shared'
import { highlightCache } from '../lib/readerOfflineCache'

type Selection = { text: string; anchor?: unknown } | null
type ToastFn = (t: { message: string; variant: 'error' | 'success' | 'info' }) => void
type User = { id: string } | null | undefined

type Options = {
  /** State mirror — must come from useState so the load effect re-runs when it lands. */
  editionId: string | null
  /** Sync handle for callbacks (create/saveNote/remove) that fire later. */
  editionIdRef: MutableRefObject<string | null>
  user: User
  isAuthenticated: boolean
  chapterId: string | null | undefined
  injectJs: (js: string) => void
  showToast: ToastFn
}

export function useReaderHighlights({
  editionId,
  editionIdRef,
  user,
  isAuthenticated,
  chapterId,
  injectJs,
  showToast,
}: Options) {
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
        if (chapterId && h.chapterId !== chapterId) continue
        injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
      }
    }, 120)
    return () => clearTimeout(t)
  }, [highlightsVersion, chapterId, injectJs])

  // Load + paint existing highlights when chapter changes. Cache-first paint
  // for offline survival; API refresh overwrites. Cache keyed per-user so
  // device-shared sign-ins can't leak another account's highlights.
  // Keys off chapterId (not the chapter object) so a refetch with the same
  // id doesn't re-trigger. Keys off editionId state (not the ref) so a race
  // where chapterId arrives before editionId still loads highlights once
  // editionId lands.
  useEffect(() => {
    if (!isAuthenticated || !editionId || !chapterId) return
    let cancelled = false

    const paint = (list: PublicHighlight[]) => {
      const chapterHighlights = list.filter(h => h.chapterId === chapterId)
      highlightsRef.current = chapterHighlights
      for (const h of chapterHighlights) {
        injectJs(`renderHighlight(${JSON.stringify(h.id)}, ${JSON.stringify(h.anchorJson)}, ${JSON.stringify(h.color)}, ${JSON.stringify(h.selectedText)})`)
      }
    }

    const uid = user?.id
    if (uid) {
      highlightCache.get(uid, editionId).then(cached => {
        if (!cancelled && cached) paint(cached)
      })
    }

    highlightsApi.getHighlights(editionId)
      .then(highlights => {
        if (cancelled) return
        paint(highlights)
        if (uid) highlightCache.set(uid, editionId, highlights)
      })
      .catch(() => { /* offline — cache paint already rendered */ })
    return () => { cancelled = true }
  }, [isAuthenticated, chapterId, user?.id, editionId, injectJs])

  const create = useCallback(
    async ({ color, selection, chapter }: { color: string; selection: NonNullable<Selection>; chapter: Chapter }) => {
      const editionId = editionIdRef.current
      if (!editionId) return
      try {
        const anchorJson = selection.anchor ? JSON.stringify(selection.anchor) : JSON.stringify({ exact: selection.text })
        const hl = await highlightsApi.createHighlight({
          editionId,
          chapterId: chapter.id,
          anchorJson,
          color,
          selectedText: selection.text,
        })
        injectJs(`renderHighlight(${JSON.stringify(hl.id)}, ${JSON.stringify(anchorJson)}, ${JSON.stringify(color)}, ${JSON.stringify(selection.text)})`)
        highlightsRef.current = [...highlightsRef.current, hl]
        bumpHighlights()
        const uid = user?.id
        if (uid) {
          highlightCache.get(uid, editionId).then(prev => {
            highlightCache.set(uid, editionId, [...(prev || []), hl])
          })
        }
      } catch (e) {
        console.warn('Failed to create highlight:', e)
        showToast({ message: 'Could not add highlight. Try again.', variant: 'error' })
      }
    },
    [editionIdRef, injectJs, showToast, user?.id, bumpHighlights]
  )

  const saveNote = useCallback(
    async (id: string, note: string) => {
      try {
        const updated = await highlightsApi.updateHighlight(id, { noteText: note || null })
        highlightsRef.current = highlightsRef.current.map(h => h.id === id ? updated : h)
        const uid = user?.id
        const edId = editionIdRef.current
        if (uid && edId) {
          highlightCache.get(uid, edId).then(prev => {
            if (!prev) return
            highlightCache.set(uid, edId, prev.map(h => h.id === id ? updated : h))
          })
        }
      } catch (e) {
        console.warn('Highlight note save failed:', e)
        showToast({ message: 'Could not save note. Try again.', variant: 'error' })
      }
    },
    [editionIdRef, showToast, user?.id]
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
        const edId = editionIdRef.current
        if (uid && edId) {
          highlightCache.get(uid, edId).then(prev => {
            if (!prev) return
            highlightCache.set(uid, edId, prev.map(h => h.id === id ? updated : h))
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
    [editionIdRef, injectJs, showToast, user?.id, bumpHighlights]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await highlightsApi.deleteHighlight(id)
        injectJs(`removeHighlight(${JSON.stringify(id)})`)
        highlightsRef.current = highlightsRef.current.filter(h => h.id !== id)
        bumpHighlights()
        const uid = user?.id
        const edId = editionIdRef.current
        if (uid && edId) {
          highlightCache.get(uid, edId).then(prev => {
            if (!prev) return
            highlightCache.set(uid, edId, prev.filter(h => h.id !== id))
          })
        }
      } catch (e) {
        console.warn('Highlight delete failed:', e)
        showToast({ message: 'Could not delete highlight. Try again.', variant: 'error' })
      }
    },
    [editionIdRef, injectJs, showToast, user?.id, bumpHighlights]
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
