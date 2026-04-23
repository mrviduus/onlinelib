import { useEffect, type RefObject } from 'react'
import type { Overlayer } from '../lib/readerOverlay'

// Drive `overlayer.redraw()` on every event that can shift Range rects:
//   - ResizeObserver on the scrolling container (font-size change, layout)
//   - document.fonts.ready (webfont swap)
//   - window.resize (viewport, device rotation)
//   - matchMedia('(prefers-color-scheme: dark)') — theme may alter metrics
//   - window.scroll — overlay hosts are position:fixed, so viewport-coord
//     rects drift on scroll. One RAF-batched redraw per frame keeps SVG
//     rects aligned with the (now-moved) text.
//
// RAF-batched so back-to-back triggers coalesce into a single redraw.

interface Options {
  /** If false, the hook does nothing (for killswitch/feature flag). */
  enabled?: boolean
}

export function useOverlayReflow(
  overlayer: Overlayer | null,
  containerRef: RefObject<Element | null>,
  { enabled = true }: Options = {},
): void {
  useEffect(() => {
    if (!enabled || !overlayer) return
    const container = containerRef.current
    if (!container) return

    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        overlayer.redraw()
      })
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      ro.observe(container)
    }

    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })

    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    if (fonts?.ready) {
      fonts.ready.then(schedule).catch(() => {})
    }

    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const mediaHandler = (): void => schedule()
    media?.addEventListener?.('change', mediaHandler)

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
      media?.removeEventListener?.('change', mediaHandler)
    }
  }, [overlayer, containerRef, enabled])
}
