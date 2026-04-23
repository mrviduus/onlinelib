import { useEffect, type RefObject } from 'react'
import type { Overlayer } from '../lib/readerOverlay'

// Drive `overlayer.redraw()` on every event that can shift Range rects:
//   - ResizeObserver on the scrolling container (font-size change, layout)
//   - document.fonts.ready (webfont swap)
//   - window.resize (viewport, device rotation)
//   - matchMedia('(prefers-color-scheme: dark)') — theme may alter metrics
//
// Scroll is handled separately via `overlayer.syncScroll()` — O(1) CSS
// transform update instead of a full redraw (rects are stored in document
// coords and the SVG is counter-translated on scroll).
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
    const scheduleRedraw = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        overlayer.redraw()
      })
    }

    let scrollScheduled = false
    const scheduleScroll = (): void => {
      if (scrollScheduled) return
      scrollScheduled = true
      requestAnimationFrame(() => {
        scrollScheduled = false
        overlayer.syncScroll()
      })
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleRedraw)
      ro.observe(container)
    }

    window.addEventListener('resize', scheduleRedraw)
    window.addEventListener('scroll', scheduleScroll, { passive: true })

    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    if (fonts?.ready) {
      fonts.ready.then(scheduleRedraw).catch(() => {})
    }

    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const mediaHandler = (): void => scheduleRedraw()
    media?.addEventListener?.('change', mediaHandler)

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', scheduleRedraw)
      window.removeEventListener('scroll', scheduleScroll)
      media?.removeEventListener?.('change', mediaHandler)
    }
  }, [overlayer, containerRef, enabled])
}
