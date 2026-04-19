import { useEffect, useState, useCallback, useRef } from 'react'
import type { StoredHighlight, HighlightColor } from '../../lib/offlineDb'
import { findTextByAnchor } from '../../lib/textAnchor'

interface HighlightRect {
  id: string
  color: HighlightColor
  hasNote: boolean
  rects: DOMRect[]
}

export interface OverlayHighlight {
  id: string
  /** CSS color string (e.g. 'hsl(180, 65%, 55%)') */
  color: string
  /** JSON-serialized TextAnchor from backend */
  anchorJson: string
  userName?: string | null
  noteText?: string | null
}

interface OverlayRect {
  id: string
  color: string
  hasNote: boolean
  rects: DOMRect[]
  userName?: string | null
  noteText?: string | null
}

interface HighlightLayerProps {
  highlights: StoredHighlight[]
  containerRef: React.RefObject<HTMLElement | null>
  onHighlightClick?: (highlight: StoredHighlight, rect: DOMRect) => void
  overlayHighlights?: OverlayHighlight[]
  onOverlayClick?: (overlay: OverlayHighlight, rect: DOMRect) => void
}

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'rgba(254, 240, 138, 0.5)',
  green: 'rgba(187, 247, 208, 0.5)',
  pink: 'rgba(251, 207, 232, 0.5)',
  blue: 'rgba(191, 219, 254, 0.5)',
}

export function HighlightLayer({
  highlights,
  containerRef,
  onHighlightClick,
  overlayHighlights,
  onOverlayClick,
}: HighlightLayerProps) {
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([])
  const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([])
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)

  const calculateRects = useCallback(() => {
    const container = containerRef.current
    const hasOwn = highlights.length > 0
    const hasOverlay = (overlayHighlights?.length ?? 0) > 0
    if (!container || (!hasOwn && !hasOverlay)) {
      setHighlightRects([])
      setOverlayRects([])
      setContainerRect(null)
      return
    }

    const newContainerRect = container.getBoundingClientRect()
    setContainerRect(newContainerRect)

    const rects: HighlightRect[] = []
    for (const highlight of highlights) {
      const range = findTextByAnchor(highlight.anchor, container)
      if (range) {
        const clientRects = Array.from(range.getClientRects())
        if (clientRects.length > 0) {
          rects.push({
            id: highlight.id,
            color: highlight.color,
            hasNote: !!highlight.noteText,
            rects: clientRects,
          })
        }
      }
    }
    setHighlightRects(rects)

    const oRects: OverlayRect[] = []
    if (overlayHighlights) {
      for (const o of overlayHighlights) {
        let anchor: unknown
        try { anchor = JSON.parse(o.anchorJson) } catch { continue }
        // findTextByAnchor accepts a TextAnchor object; cast through unknown.
        const range = findTextByAnchor(anchor as Parameters<typeof findTextByAnchor>[0], container)
        if (range) {
          const clientRects = Array.from(range.getClientRects())
          if (clientRects.length > 0) {
            oRects.push({
              id: o.id,
              color: o.color,
              hasNote: !!o.noteText,
              rects: clientRects,
              userName: o.userName,
              noteText: o.noteText,
            })
          }
        }
      }
    }
    setOverlayRects(oRects)
  }, [highlights, overlayHighlights, containerRef])

  // Recalculate on highlights change
  useEffect(() => {
    calculateRects()
  }, [calculateRects])

  // Recalculate on scroll/resize
  useEffect(() => {
    const handleUpdate = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(calculateRects)
    }

    window.addEventListener('scroll', handleUpdate, { passive: true })
    window.addEventListener('resize', handleUpdate, { passive: true })

    // Also observe container mutations (column changes, etc)
    const container = containerRef.current
    let observer: MutationObserver | null = null
    if (container) {
      observer = new MutationObserver(handleUpdate)
      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    }

    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      observer?.disconnect()
    }
  }, [containerRef, calculateRects])

  if ((highlightRects.length === 0 && overlayRects.length === 0) || !containerRect) {
    return null
  }

  const handleClick = (id: string, rect: DOMRect) => {
    const highlight = highlights.find((h) => h.id === id)
    if (highlight && onHighlightClick) {
      const viewportRect = new DOMRect(rect.left, rect.top, rect.width, rect.height)
      onHighlightClick(highlight, viewportRect)
    }
  }

  const handleOverlayClick = (id: string, rect: DOMRect) => {
    const overlay = overlayHighlights?.find(o => o.id === id)
    if (overlay && onOverlayClick) {
      const viewportRect = new DOMRect(rect.left, rect.top, rect.width, rect.height)
      onOverlayClick(overlay, viewportRect)
    }
  }

  return (
    <svg
      className="highlight-layer"
      style={{
        position: 'fixed',
        top: containerRect.top,
        left: containerRect.left,
        width: containerRect.width,
        height: containerRect.height,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Shared highlights from other room members — rendered below own so own stays readable on top */}
      {overlayRects.map(({ id, color, hasNote, rects, userName, noteText }) =>
        rects.map((rect, i) => (
          <rect
            key={`overlay-${id}-${i}`}
            className={`overlay-highlight${hasNote ? ' has-note' : ''}`}
            x={rect.left - containerRect.left}
            y={rect.top - containerRect.top}
            width={rect.width}
            height={rect.height}
            fill={color}
            fillOpacity={0.25}
            stroke={color}
            strokeOpacity={0.7}
            strokeWidth={1}
            rx={2}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onClick={() => handleOverlayClick(id, rect)}
          >
            <title>
              {userName ? `${userName}${noteText ? `: ${noteText}` : ''}` : noteText ?? ''}
            </title>
          </rect>
        ))
      )}
      {highlightRects.map(({ id, color, hasNote, rects }) =>
        rects.map((rect, i) => (
          <rect
            key={`${id}-${i}`}
            className={hasNote ? 'has-note' : undefined}
            x={rect.left - containerRect.left}
            y={rect.top - containerRect.top}
            width={rect.width}
            height={rect.height}
            fill={COLOR_MAP[color]}
            rx={2}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onClick={() => handleClick(id, rect)}
          />
        ))
      )}
    </svg>
  )
}
