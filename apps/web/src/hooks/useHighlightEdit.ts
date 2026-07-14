import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import { findTextByAnchor, createTextAnchor } from '../lib/textAnchor'
import type { HighlightAnchor, HighlightColor, StoredHighlight } from '../lib/offlineDb'

/** Repeatable drawer jump: same id re-fires when the nonce changes. */
export interface ScrollToHighlight {
  id: string
  nonce: number
}

interface UseHighlightEditOptions {
  // Highlights + mutators are hoisted to ReaderPage and passed in, so the reader
  // owns a single useHighlights instance (shared with the PDF paint path).
  highlights: StoredHighlight[]
  addHighlight: (anchor: HighlightAnchor, color: HighlightColor, selectedText: string) => Promise<StoredHighlight>
  updateHighlight: (id: string, updates: { color?: HighlightColor; noteText?: string | null }) => Promise<StoredHighlight | null>
  removeHighlight: (id: string) => Promise<void>
  chapterId: string
  containerRef: RefObject<HTMLElement | null>
  scrollToHighlightId?: string | null
  /** Nonce-driven jump from the TOC drawer's Highlights tab (reflow only). */
  scrollToHl?: ScrollToHighlight | null
  onAfterCreate?: () => void
}

export interface UseHighlightEditResult {
  highlights: StoredHighlight[]
  editingHighlight: StoredHighlight | null
  editingRect: DOMRect | null
  handleHighlightClick: (highlight: StoredHighlight, rect: DOMRect) => void
  closeNoteEditor: () => void
  handleNoteSave: (noteText: string | null) => Promise<void>
  handleHighlightDelete: () => Promise<void>
  createHighlightFromSelection: (
    range: Range | null,
    text: string,
    color: HighlightColor,
  ) => Promise<void>
}

export function useHighlightEdit({
  highlights,
  addHighlight,
  updateHighlight,
  removeHighlight,
  chapterId,
  containerRef,
  scrollToHighlightId,
  scrollToHl,
  onAfterCreate,
}: UseHighlightEditOptions): UseHighlightEditResult {
  // Locate a reflow highlight by its text anchor and center it in the viewport.
  // Shared by the URL-mount one-shot and the drawer's nonce-driven jump.
  const scrollToHighlightById = useCallback(
    (id: string) => {
      const target = highlights.find((h) => h.id === id)
      if (!target || !containerRef.current) return
      requestAnimationFrame(() => {
        const range = findTextByAnchor(target.anchor, containerRef.current!)
        if (!range) return
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        const targetY = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
        window.scrollTo({ top: targetY, behavior: 'smooth' })
      })
    },
    [highlights, containerRef],
  )

  // URL deep-link (?highlight=<id>): one-shot on mount once highlights load.
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!scrollToHighlightId || scrolledRef.current) return
    if (highlights.length === 0 || !containerRef.current) return
    if (!highlights.some((h) => h.id === scrollToHighlightId)) return
    scrolledRef.current = true
    scrollToHighlightById(scrollToHighlightId)
  }, [scrollToHighlightId, highlights, containerRef, scrollToHighlightById])

  // Drawer jump: nonce-driven so re-selecting the same highlight re-fires.
  const lastNonceRef = useRef<number | null>(null)
  useEffect(() => {
    if (!scrollToHl) return
    if (lastNonceRef.current === scrollToHl.nonce) return
    lastNonceRef.current = scrollToHl.nonce
    scrollToHighlightById(scrollToHl.id)
  }, [scrollToHl, scrollToHighlightById])

  const [editingHighlight, setEditingHighlight] = useState<StoredHighlight | null>(null)
  const [editingRect, setEditingRect] = useState<DOMRect | null>(null)

  const handleHighlightClick = useCallback(
    (highlight: StoredHighlight, rect: DOMRect) => {
      setEditingHighlight(highlight)
      setEditingRect(rect)
    },
    [],
  )

  const closeNoteEditor = useCallback(() => {
    setEditingHighlight(null)
    setEditingRect(null)
  }, [])

  const handleNoteSave = useCallback(
    async (noteText: string | null) => {
      if (editingHighlight) await updateHighlight(editingHighlight.id, { noteText })
    },
    [editingHighlight, updateHighlight],
  )

  const handleHighlightDelete = useCallback(async () => {
    if (!editingHighlight) return
    await removeHighlight(editingHighlight.id)
    closeNoteEditor()
  }, [editingHighlight, removeHighlight, closeNoteEditor])

  const createHighlightFromSelection = useCallback(
    async (range: Range | null, text: string, color: HighlightColor) => {
      if (!range || !containerRef.current) return
      const anchor = createTextAnchor(range, chapterId, containerRef.current)
      await addHighlight(anchor, color, text)
      onAfterCreate?.()
    },
    [containerRef, chapterId, addHighlight, onAfterCreate],
  )

  return {
    highlights,
    editingHighlight,
    editingRect,
    handleHighlightClick,
    closeNoteEditor,
    handleNoteSave,
    handleHighlightDelete,
    createHighlightFromSelection,
  }
}
