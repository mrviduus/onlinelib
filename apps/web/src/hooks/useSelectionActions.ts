import { useCallback, type RefObject } from 'react'
import { useTranslationPopup, type UseTranslationPopupResult } from './useTranslationPopup'
import { useExplainPopup, type UseExplainPopupResult } from './useExplainPopup'
import type { HighlightColor } from '../lib/offlineDb'

interface SelectionLike {
  text: string
  rect: DOMRect | null
  range: Range | null
}

interface Params {
  containerRef: RefObject<HTMLElement | null>
  editionId: string
  bookLanguage: string
  targetLang: string | null
  nativeLanguage: string
  selection: SelectionLike
  clearSelection: () => void
  createHighlightFromSelection: (
    range: Range | null,
    text: string,
    color: HighlightColor,
  ) => Promise<void>
}

export interface UseSelectionActionsResult {
  translationPopup: UseTranslationPopupResult
  explainPopup: UseExplainPopupResult
  handleHighlight: (color: HighlightColor) => Promise<void>
  handleTranslate: () => void
  handleExplain: () => void
  handleCopy: () => void
}

export function useSelectionActions({
  containerRef,
  editionId,
  bookLanguage,
  targetLang,
  nativeLanguage,
  selection,
  clearSelection,
  createHighlightFromSelection,
}: Params): UseSelectionActionsResult {
  const translationPopup = useTranslationPopup({
    bookLanguage,
    targetLang,
    onClose: clearSelection,
  })

  const explainPopup = useExplainPopup({
    containerRef,
    editionId,
    nativeLanguage,
    onClose: clearSelection,
  })

  const handleTranslate = useCallback(() => {
    if (!selection.text || !selection.rect) return
    translationPopup.open(selection.text, selection.rect)
  }, [selection.text, selection.rect, translationPopup])

  const handleExplain = useCallback(() => {
    explainPopup.openFromSelection(selection.text, selection.range, selection.rect)
  }, [explainPopup, selection.text, selection.range, selection.rect])

  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      await createHighlightFromSelection(selection.range, selection.text, color)
      clearSelection()
      translationPopup.close()
    },
    [selection.range, selection.text, createHighlightFromSelection, clearSelection, translationPopup],
  )

  const handleCopy = useCallback(() => {
    clearSelection()
    translationPopup.close()
  }, [clearSelection, translationPopup])

  return { translationPopup, explainPopup, handleHighlight, handleTranslate, handleExplain, handleCopy }
}
