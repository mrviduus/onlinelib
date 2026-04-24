import { useEffect, useMemo, useRef } from 'react'
import { Overlayer } from '@textstack/reader-overlay'
import { useOverlayReflow } from '../../hooks/useOverlayReflow'
import { count } from '../../lib/vocabHighlightTelemetry'

// Mounts the SVG overlayer inside the given container. Exposes the Overlayer
// instance via ref so annotation layers can register ranges.
//
// Dispatches CustomEvents on the container:
//   - 'reader-annotation-click' { detail: { key, range } } — tap inside a rect
//   - 'reader-selection'        { detail: { range, text } } — native selection
//
// No prop drilling: annotation layers subscribe to these events.

interface Props {
  /** Scrolling container that owns this overlay. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Receives the Overlayer instance; nulls on unmount. */
  overlayerRef: React.MutableRefObject<Overlayer | null>
  /** Killswitch — when false, overlay is unmounted entirely. */
  enabled?: boolean
}

export function ReaderOverlay({ containerRef, overlayerRef, enabled = true }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  const overlayer = useMemo(
    () =>
      enabled
        ? new Overlayer({
            onMiss: (key, reason) => count('reader.overlay.miss', { key, reason }),
            onRedraw: ({ size, missCount }) => {
              count('reader.overlay.redraw', { size, missCount })
            },
          })
        : null,
    [enabled],
  )

  useEffect(() => {
    overlayerRef.current = overlayer
    return () => {
      overlayerRef.current = null
    }
  }, [overlayer, overlayerRef])

  useEffect(() => {
    if (!overlayer) return
    const host = hostRef.current
    if (!host) return
    host.appendChild(overlayer.element)
    count('reader.overlay.mount')
    return () => {
      if (overlayer.element.parentNode === host) {
        host.removeChild(overlayer.element)
      }
      overlayer.clear()
    }
  }, [overlayer])

  useOverlayReflow(overlayer, containerRef, { enabled })

  useEffect(() => {
    if (!overlayer) return
    const container = containerRef.current
    if (!container) return

    const handleClick = (e: MouseEvent): void => {
      // iOS Safari fires a synthetic click ~300 ms after touchend; if we
      // already anchored on the primary click, skip the replay.
      if (overlayer.isJustAnchored()) return
      const [key, range] = overlayer.hitTest({ x: e.clientX, y: e.clientY })
      if (!key) return
      overlayer.markJustAnchored()
      container.dispatchEvent(
        new CustomEvent('reader-annotation-click', {
          detail: { key, range, clientX: e.clientX, clientY: e.clientY },
          bubbles: true,
        }),
      )
    }

    const handleSelectionChange = (): void => {
      // Suppress selection-popup race: tapping a highlight often races a
      // selectionchange from the same touch. If we just handled an
      // annotation-click, skip this event.
      if (overlayer.isJustAnchored()) return
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return
      container.dispatchEvent(
        new CustomEvent('reader-selection', {
          detail: { range, text: sel.toString() },
          bubbles: true,
        }),
      )
    }

    container.addEventListener('click', handleClick)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      container.removeEventListener('click', handleClick)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [overlayer, containerRef])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
