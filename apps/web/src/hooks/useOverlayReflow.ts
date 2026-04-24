import { useEffect, type RefObject } from 'react'
import type { Overlayer } from '@textstack/reader-overlay'

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

    // Image load → text below shifts down → annotation rects stale until next
    // resize/scroll. Foliate avoids this via iframes (which fire their own
    // load); we have flat DOM, so wire it explicitly. Cover existing imgs
    // and any added later via MutationObserver.
    const tracked = new WeakSet<HTMLImageElement>()
    const onImgLoad = (): void => scheduleRedraw()
    const trackImage = (img: HTMLImageElement): void => {
      if (tracked.has(img)) return
      tracked.add(img)
      if (img.complete && img.naturalWidth > 0) return
      img.addEventListener('load', onImgLoad, { once: true })
      img.addEventListener('error', onImgLoad, { once: true })
    }
    container.querySelectorAll('img').forEach((el) => trackImage(el as HTMLImageElement))

    let imgObserver: MutationObserver | null = null
    if (typeof MutationObserver !== 'undefined') {
      imgObserver = new MutationObserver((records) => {
        for (const rec of records) {
          rec.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return
            const el = node as Element
            if (el.tagName === 'IMG') trackImage(el as HTMLImageElement)
            el.querySelectorAll?.('img').forEach((img) => trackImage(img as HTMLImageElement))
          })
        }
      })
      imgObserver.observe(container, { childList: true, subtree: true })
    }

    return () => {
      ro?.disconnect()
      imgObserver?.disconnect()
      window.removeEventListener('resize', scheduleRedraw)
      window.removeEventListener('scroll', scheduleScroll)
      media?.removeEventListener?.('change', mediaHandler)
    }
  }, [overlayer, containerRef, enabled])
}
