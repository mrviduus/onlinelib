import { useCallback, useEffect, useRef, useState } from 'react'

export type Selection = {
  text: string
  sentence: string
  anchor?: any
  selectionId: number
  /** 'tap' = single-finger tap that always shows WordCard. 'drag' = native long-press / drag
   * selection; routed by content (single word → WordCard, multi → SelectionActionBar). */
  mode: 'tap' | 'drag'
}

export type LookupState = {
  kind: 'lookup' | 'lookup_pending'
  id: string
  tapsRemaining: number | null
  busy: boolean
}

type Options = {
  /** Persist vocab map to per-user cache when the selection closes. */
  flushVocabMap: () => void
}

/**
 * Owns the selection lifecycle: the active selection, post-save UI flags
 * (`wordSaved`, `lookupState`), the per-event id counter, and the iOS
 * dedup ref for auto-save.
 *
 * `selectionId` increments per selection *event* (even when the user taps
 * the same word twice). WordCard uses it as a useEffect dep so the
 * auto-dismiss timer resets on each re-select (B-12) — and we use it at
 * the parent to toggle dismiss when the same word is re-tapped.
 *
 * `autoSavedRef` swallows the iOS double-fire of the WebView selection
 * event (one tap → two events). Cleared on dismiss so a stale vocabMapRef
 * never blocks retry across fresh taps.
 */
export function useReaderSelection({ flushVocabMap }: Options) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [wordSaved, setWordSaved] = useState(false)
  const [lookupState, setLookupState] = useState<LookupState | null>(null)
  const selectionIdRef = useRef(0)
  const autoSavedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (__DEV__) console.log('[diag] selection STATE:', selection?.text ?? 'null', 'id=', selection?.selectionId)
  }, [selection])

  // Clear the auto-save dedup + flush vocab map to cache as soon as the
  // selection closes — keeps the iOS-dup guard for the current tap but lets
  // the next tap retry freely even if vocabMapRef didn't catch the save.
  useEffect(() => {
    if (!selection) {
      autoSavedRef.current.clear()
      flushVocabMap()
    }
  }, [selection, flushVocabMap])

  /**
   * Opens or closes the selection in response to a WebView postMessage.
   * Returns the freshly minted `selectionId` for single-word callers that
   * still need to wire up auto-TTS / auto-save (the hook stays out of those
   * concerns to avoid coupling to vocab/TTS internals).
   */
  const openSelection = useCallback(
    (payload: { text: string; sentence?: string; anchor?: any; mode?: 'tap' | 'drag' } | null): number | null => {
      if (!payload || !payload.text) {
        if (__DEV__) console.log('[diag] setSelection NULL (empty-data branch)')
        setSelection(null)
        return null
      }
      if (__DEV__) console.log('[diag] setSelection OPEN', payload.text, 'mode=', payload.mode || 'drag')
      const nextId = ++selectionIdRef.current
      setSelection({
        text: payload.text,
        sentence: payload.sentence || '',
        anchor: payload.anchor || null,
        selectionId: nextId,
        mode: payload.mode || 'drag',
      })
      setWordSaved(false)
      setLookupState(null)
      return nextId
    },
    [],
  )

  return {
    selection,
    setSelection,
    wordSaved,
    setWordSaved,
    lookupState,
    setLookupState,
    openSelection,
  }
}
