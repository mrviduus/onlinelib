import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Overlayer } from '../../lib/readerOverlay'
import { useOverlayAnnotations, type AnnotationSpec } from '../../hooks/useOverlayAnnotations'
import { useOverlayReflow } from '../../hooks/useOverlayReflow'
import { findTextByAnchor } from '../../lib/textAnchor'
import type { HighlightColor, StoredHighlight } from '../../lib/offlineDb'

// New highlights path using the shared SVG Overlayer. Behind
// FEATURES.readerOverlayV2 — legacy HighlightLayer stays as fallback.
//
// Positions the overlayer SVG as a viewport-fixed sibling so raw
// range.getClientRects() coords land 1:1 on screen. Reflow hook drives
// redraw on resize / font-ready / theme change.

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'rgba(254, 240, 138, 0.5)',
  green: 'rgba(187, 247, 208, 0.5)',
  pink: 'rgba(251, 207, 232, 0.5)',
  blue: 'rgba(191, 219, 254, 0.5)',
}

interface Props {
  highlights: StoredHighlight[]
  containerRef: React.RefObject<HTMLElement | null>
  onHighlightClick?: (highlight: StoredHighlight, rect: DOMRect) => void
}

export function HighlightOverlayLayer({ highlights, containerRef, onHighlightClick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const overlayer = useMemo(() => new Overlayer(), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.appendChild(overlayer.element)
    return () => {
      if (overlayer.element.parentNode === host) host.removeChild(overlayer.element)
      overlayer.clear()
    }
  }, [overlayer])

  const map = useCallback(
    (h: StoredHighlight): AnnotationSpec<StoredHighlight> | null => {
      const container = containerRef.current
      if (!container) return null
      const range = findTextByAnchor(h.anchor, container)
      if (!range) return null
      return {
        item: h,
        key: h.id,
        range,
        options: { color: COLOR_MAP[h.color], opacity: 1, blendMode: 'normal' },
      }
    },
    [containerRef],
  )

  useOverlayAnnotations<StoredHighlight>(overlayer, {
    namespace: 'user-hl',
    items: highlights,
    draw: Overlayer.highlight,
    map,
  })

  useOverlayReflow(overlayer, containerRef)

  useEffect(() => {
    if (!onHighlightClick) return
    const container = containerRef.current
    if (!container) return
    const handler = (e: MouseEvent): void => {
      const [key, range] = overlayer.hitTest({ x: e.clientX, y: e.clientY })
      if (!key || !range || !key.startsWith('user-hl:')) return
      const id = key.slice('user-hl:'.length)
      const h = highlights.find((hh) => hh.id === id)
      if (!h) return
      onHighlightClick(h, range.getBoundingClientRect())
    }
    container.addEventListener('click', handler)
    return () => container.removeEventListener('click', handler)
  }, [overlayer, containerRef, highlights, onHighlightClick])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-highlight-overlay="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  )
}
