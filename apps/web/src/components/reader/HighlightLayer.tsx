import { useEffect, useState, useCallback, useRef } from 'react'
import type { StoredHighlight, HighlightColor } from '../../lib/offlineDb'
import { findTextByAnchor } from '../../lib/textAnchor'
import type { Hotspot } from '../../api/socialHighlights'

interface HighlightRect {
  id: string
  color: HighlightColor
  hasNote: boolean
  rects: DOMRect[]
}

interface HotspotRect {
  key: string
  count: number
  rects: DOMRect[]
}

interface HighlightLayerProps {
  highlights: StoredHighlight[]
  containerRef: React.RefObject<HTMLElement | null>
  onHighlightClick?: (highlight: StoredHighlight, rect: DOMRect) => void
  hotspots?: Hotspot[]
  onHotspotClick?: (hotspot: Hotspot, rect: DOMRect) => void
}

const COLOR_MAP: Record<HighlightColor, string> = {
  yellow: 'rgba(254, 240, 138, 0.5)',
  green: 'rgba(187, 247, 208, 0.5)',
  pink: 'rgba(251, 207, 232, 0.5)',
  blue: 'rgba(191, 219, 254, 0.5)',
}

const MIN_HOTSPOT_COUNT = 2

function normalize(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function HighlightLayer({
  highlights,
  containerRef,
  onHighlightClick,
  hotspots,
  onHotspotClick,
}: HighlightLayerProps) {
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([])
  const [hotspotRects, setHotspotRects] = useState<HotspotRect[]>([])
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)

  const calculateRects = useCallback(() => {
    const container = containerRef.current
    const ownHotspots = (hotspots ?? []).filter(h => h.count >= MIN_HOTSPOT_COUNT)
    const hasOwn = highlights.length > 0
    const hasHotspots = ownHotspots.length > 0
    if (!container || (!hasOwn && !hasHotspots)) {
      setHighlightRects([])
      setHotspotRects([])
      setContainerRect(null)
      return
    }

    const newContainerRect = container.getBoundingClientRect()
    setContainerRect(newContainerRect)

    const ownNormalized = new Set(highlights.map(h => normalize(h.selectedText || '')))

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

    const hRects: HotspotRect[] = []
    for (const hot of ownHotspots) {
      // Skip if user has their own highlight for the same text — don't double-render.
      if (ownNormalized.has(normalize(hot.text))) continue
      let anchor: unknown
      try { anchor = JSON.parse(hot.anchorJson) } catch { continue }
      const range = findTextByAnchor(anchor as Parameters<typeof findTextByAnchor>[0], container)
      if (range) {
        const clientRects = Array.from(range.getClientRects())
        if (clientRects.length > 0) {
          hRects.push({ key: hot.key, count: hot.count, rects: clientRects })
        }
      }
    }
    setHotspotRects(hRects)
  }, [highlights, hotspots, containerRef])

  useEffect(() => {
    calculateRects()
  }, [calculateRects])

  useEffect(() => {
    const handleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(calculateRects)
    }

    window.addEventListener('scroll', handleUpdate, { passive: true })
    window.addEventListener('resize', handleUpdate, { passive: true })

    const container = containerRef.current
    let observer: MutationObserver | null = null
    if (container) {
      observer = new MutationObserver(handleUpdate)
      observer.observe(container, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      observer?.disconnect()
    }
  }, [containerRef, calculateRects])

  if ((highlightRects.length === 0 && hotspotRects.length === 0) || !containerRect) {
    return null
  }

  const handleClick = (id: string, rect: DOMRect) => {
    const highlight = highlights.find((h) => h.id === id)
    if (highlight && onHighlightClick) {
      const viewportRect = new DOMRect(rect.left, rect.top, rect.width, rect.height)
      onHighlightClick(highlight, viewportRect)
    }
  }

  const handleHotspotClick = (key: string, rect: DOMRect) => {
    const hot = hotspots?.find(h => h.key === key)
    if (hot && onHotspotClick) {
      const viewportRect = new DOMRect(rect.left, rect.top, rect.width, rect.height)
      onHotspotClick(hot, viewportRect)
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
      {/* Hotspots — subtle underline below own highlights so user's own stay readable on top */}
      {hotspotRects.map(({ key, count, rects }) => {
        const lastRect = rects[rects.length - 1]
        return (
          <g key={`hotspot-${key}`}>
            {rects.map((rect, i) => (
              <rect
                key={`hotspot-${key}-${i}`}
                className="hotspot-underline"
                x={rect.left - containerRect.left}
                y={rect.bottom - containerRect.top - 2}
                width={rect.width}
                height={2}
                fill="rgba(99, 102, 241, 0.55)"
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => handleHotspotClick(key, rect)}
              >
                <title>{`${count} readers highlighted this`}</title>
              </rect>
            ))}
            {lastRect && (
              <g
                transform={`translate(${lastRect.right - containerRect.left + 4}, ${lastRect.top - containerRect.top + lastRect.height / 2 - 9})`}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => handleHotspotClick(key, lastRect)}
              >
                <rect width={28} height={18} rx={9} fill="rgba(99, 102, 241, 0.92)" />
                <text x={14} y={13} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">
                  {`👥 ${count}`}
                </text>
              </g>
            )}
          </g>
        )
      })}
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
