import { buildPdfAnchor, type PdfAnchor } from '@textstack/shared'

// Web glue over the shared, DOM-free `buildPdfAnchor`. Given a DOM Range over a
// pdf.js text layer, resolve the START page + live render scale from the DOM and
// hand the raw client-rect numbers to the pure builder.
//
// - Walks `range.startContainer` up to the nearest `.pdf-page[data-page]`.
// - Reads the live scale from a `data-scale` attribute that `PdfOriginalView`
//   writes on its `.pdf-original__pages` container (nearest ancestor with it).
// - Clamps to the START page: the shared center-filter drops rects that spill
//   onto the next page. v1 limitation — a multi-page selection keeps only the
//   start-page portion.

/** Nearest ancestor element (inclusive) that is a `.pdf-page[data-page]`. */
function findPageEl(node: Node | null): HTMLElement | null {
  let cur: Node | null = node
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement
      if (el.classList?.contains('pdf-page') && el.dataset.page) return el
    }
    cur = cur.parentNode
  }
  return null
}

/** Live render scale: `data-scale` on the pages container (or a fallback root). */
function resolveScale(pageEl: HTMLElement, fallbackRoot: HTMLElement | null): number {
  const host = pageEl.closest<HTMLElement>('[data-scale]')
  const raw = host?.dataset.scale ?? fallbackRoot?.querySelector<HTMLElement>('[data-scale]')?.dataset.scale
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Build a PdfAnchor from a live Range over the Original-layout PDF text layer.
 * Returns null when the range isn't inside a rendered PDF page (nothing to
 * anchor) or produces no in-page rects.
 */
export function computePdfAnchorFromRange(
  range: Range,
  pagesEl: HTMLElement | null,
): PdfAnchor | null {
  const pageEl = findPageEl(range.startContainer)
  if (!pageEl) return null
  const page = Number(pageEl.dataset.page)
  if (!page) return null

  const scale = resolveScale(pageEl, pagesEl)
  const pageRect = pageEl.getBoundingClientRect()
  const clientRects = Array.from(range.getClientRects())
  const exact = range.toString()

  const anchor = buildPdfAnchor(
    page,
    { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
    clientRects,
    scale,
    exact,
  )
  return anchor.rects.length > 0 ? anchor : null
}
