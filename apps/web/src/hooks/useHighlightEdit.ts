import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import { useHighlights } from './useHighlights'
import { findTextByAnchor, createTextAnchor } from '../lib/textAnchor'
import type { HighlightColor, StoredHighlight } from '../lib/offlineDb'

interface UseHighlightEditOptions {
  editionId?: string
  userBookId?: string
  chapterId: string
  containerRef: RefObject<HTMLElement | null>
  isAuthenticated?: boolean
  scrollToHighlightId?: string | null
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
  editionId,
  userBookId,
  chapterId,
  containerRef,
  isAuthenticated,
  scrollToHighlightId,
  onAfterCreate,
}: UseHighlightEditOptions): UseHighlightEditResult {
  const { highlights, addHighlight, updateHighlight, removeHighlight } = useHighlights(
    userBookId ? undefined : editionId,
    userBookId,
    { isAuthenticated },
  )

  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!scrollToHighlightId || scrolledRef.current) return
    if (highlights.length === 0 || !containerRef.current) return
    const target = highlights.find((h) => h.id === scrollToHighlightId)
    if (!target) return
    scrolledRef.current = true
    requestAnimationFrame(() => {
      const range = findTextByAnchor(target.anchor, containerRef.current!)
      if (!range) return
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const targetY = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
      window.scrollTo({ top: targetY, behavior: 'smooth' })
    })
  }, [scrollToHighlightId, highlights, containerRef])

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
