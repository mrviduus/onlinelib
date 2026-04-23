import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

// Compute placements in DOCUMENT coords (not viewport). The overlay wrapper
// is position:absolute at document origin, so spans scroll naturally with
// content — no per-scroll reposition. Legacy <mark>-wrapped translations had
// the same property for free; we recover it via scrollX/scrollY offset.
function placeMatches(matches: readonly WordMatch[]): Placed[] {
  const placed: Placed[] = []
  const sx = window.scrollX
  const sy = window.scrollY
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (!m.translation) continue
    const rect = m.range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    placed.push({
      key: `${m.key}:${i}`,
      text: m.translation,
      x: rect.left + sx + rect.width / 2,
      y: rect.top + sy,
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

  // Recompute whenever match set changes. Critical UX detail: during chapter
  // eviction/remount, old Ranges are briefly detached and return zero rects.
  // If we cleared placements in that window, translations would vanish until
  // the mutation-observer-driven recompute finishes — looks like "flicker
  // with delay" on scroll. Keep the last good placements during transient
  // empty computes (matches still non-empty) so the overlay rides through.
  useEffect(() => {
    if (!visible) {
      setPlacements([])
      return
    }
    const next = placeMatches(matches)
    if (next.length === 0 && matches.length > 0) return
    setPlacements(next)
  }, [matches, visible])

  // Recompute on resize/font-change. Scroll is NOT a trigger — document-coord
  // placements ride the scroll naturally (like legacy <mark>-wrapped spans).
  useEffect(() => {
    if (!visible) return

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const next = placeMatches(matches)
          if (next.length === 0 && matches.length > 0) return
          setPlacements(next)
        })
      }, reflowDebounceMs)
    }

    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      window.removeEventListener('resize', schedule)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [matches, visible, reflowDebounceMs])

  if (!visible || placements.length === 0) return null

  // Portal to body so the overlay's containing block is the initial one —
  // (x, y) are document coords, independent of any positioned ancestor.
  return createPortal(
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
    </div>,
    document.body,
  )
}
