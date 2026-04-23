import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordMatch } from '../../lib/vocabHighlightEngine'

interface VocabTranslationOverlayProps {
  matches: readonly WordMatch[]
  // Toggles visibility without re-computing matches (kills the reflow cost
  // of hiding via conditional mount/unmount).
  visible: boolean
  // Debounce window for scroll/resize-driven reposition. 100ms keeps drag
  // reflows smooth without lagging behind user input.
  reflowDebounceMs?: number
}

interface Placed {
  key: string
  text: string
  x: number
  y: number
}

// Compute placements from Ranges. Viewport-coord transforms keep the overlay
// element fixed and let the browser GPU-translate spans on scroll.
function placeMatches(matches: readonly WordMatch[]): Placed[] {
  const placed: Placed[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (!m.translation) continue
    const rect = m.range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    placed.push({
      // Dedupe-safe key — same word can appear many times in a chapter.
      key: `${m.key}:${i}`,
      text: m.translation,
      // Center horizontally above the word; nudge y up just above it.
      x: rect.left + rect.width / 2,
      y: rect.top - 2,
    })
  }
  return placed
}

// Decorative layer for inline translations. Pure — callers decide when to
// recompute (mutation observer, vocabMap changes). All positioning is
// viewport-based so scroll "just works" without per-scroll re-layout.
export function VocabTranslationOverlay({
  matches,
  visible,
  reflowDebounceMs = 100,
}: VocabTranslationOverlayProps) {
  const [placements, setPlacements] = useState<Placed[]>([])
  const rafRef = useRef<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stableMatches = useMemo(() => matches, [matches])

  // Recompute whenever match set changes.
  useEffect(() => {
    if (!visible) {
      setPlacements([])
      return
    }
    const next = placeMatches(stableMatches)
    setPlacements(next)
  }, [stableMatches, visible])

  // Recompute on scroll/resize/font-change. RAF-guarded + debounced so a
  // rapid drag doesn't queue hundreds of setState calls.
  useEffect(() => {
    if (!visible) return

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          setPlacements(placeMatches(stableMatches))
        })
      }, reflowDebounceMs)
    }

    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [stableMatches, visible, reflowDebounceMs])

  if (!visible || placements.length === 0) return null

  return (
    <div className="vocab-translation-overlay" data-vocab-overlay="true" aria-hidden="true">
      {placements.map((p) => (
        <span
          key={p.key}
          className="vocab-translation-overlay__item"
          style={
            {
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
            } as React.CSSProperties
          }
        >
          {p.text}
        </span>
      ))}
    </div>
  )
}
