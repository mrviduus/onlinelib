import { useEffect, useState, useRef } from 'react'

export type BubbleState = 'loading' | 'ready' | 'error'

interface Props {
  word: string
  translation: string | null
  state: BubbleState
  rect: DOMRect | null
  onClose: () => void
  /** ms before fade-out begins; fade lasts 200ms on top. Default 2800. */
  holdMs?: number
}

/**
 * Minimal translation bubble shown on single-word selection.
 * Auto-fades out after `holdMs` + 200ms transition (default total ~3s).
 */
export function TranslationBubble({
  word: _word,
  translation,
  state,
  rect,
  onClose,
  holdMs = 2800,
}: Props) {
  const [fadingOut, setFadingOut] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Start fade only once we have something to show (not during 'loading').
  useEffect(() => {
    if (state === 'loading') return
    fadeTimerRef.current = setTimeout(() => setFadingOut(true), holdMs)
    closeTimerRef.current = setTimeout(onClose, holdMs + 200)
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [state, holdMs, onClose])

  if (!rect) return null

  const top = rect.top + window.scrollY - 40
  const left = rect.left + window.scrollX + rect.width / 2

  return (
    <div
      className={`translation-bubble${fadingOut ? ' translation-bubble--fading' : ''}`}
      style={{ top, left }}
      role="tooltip"
    >
      {state === 'loading' ? '…' : state === 'error' ? '—' : translation}
    </div>
  )
}
