// Quad-rect anchor for persistent highlights on the Original-layout PDF reader
// (ADR "PDF highlights" S-b). Stored verbatim in the highlight `anchor`
// (AnchorJson, opaque to the server) so web + the future mobile bundled viewer
// paint the SAME shape.
//
// Coordinates are page-relative and UNSCALED (scale=1 viewport space, top-left
// origin — the space pdf.js text-layer spans live in). `exact` is the selected
// text, for display only (HighlightsPage / review / export), NEVER for painting.
//
// Round-trip: capture x = (clientRect.left − pageRect.left) / scale; repaint
// left = x · scale (same for y / w / h). Kept DOM-free (plain rect numbers in,
// plain numbers out) so it's unit-testable and reusable by the mobile bundle.

/** A single painted quad, page-relative and unscaled. */
export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

/** Discriminated (`kind: 'pdf'`) so it never collides with the reflow TextAnchor. */
export interface PdfAnchor {
  v: 1
  kind: 'pdf'
  page: number
  rects: PdfRect[]
  exact: string
}

/** A viewport/client rect as we need it — subset of DOMRect, so DOMRects pass. */
export interface ClientRectLike {
  left: number
  top: number
  width: number
  height: number
}

/** Page box in client space (subset of DOMRect). */
export interface PageRectLike {
  left: number
  top: number
  width: number
  height: number
}

/** 2-decimal rounding — sub-pixel precision is noise for a painted highlight. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Convert client rects (from `range.getClientRects()`) into a page-relative,
 * unscaled PdfAnchor.
 *
 * - Drops zero-area rects (empty line boxes pdf.js sometimes emits).
 * - CENTER-FILTER: keeps only rects whose center lies inside the page box. This
 *   clamps a multi-page selection to the START page — rects that spill onto the
 *   next page (center below the page bottom) are dropped. v1 limitation:
 *   cross-page selections keep only the start-page portion.
 */
export function buildPdfAnchor(
  page: number,
  pageRect: PageRectLike,
  clientRects: ClientRectLike[],
  scale: number,
  exact: string,
): PdfAnchor {
  const s = scale || 1
  const right = pageRect.left + pageRect.width
  const bottom = pageRect.top + pageRect.height

  const rects: PdfRect[] = clientRects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .filter((r) => {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      return cx >= pageRect.left && cx <= right && cy >= pageRect.top && cy <= bottom
    })
    .map((r) => ({
      x: round2((r.left - pageRect.left) / s),
      y: round2((r.top - pageRect.top) / s),
      w: round2(r.width / s),
      h: round2(r.height / s),
    }))

  return { v: 1, kind: 'pdf', page, rects, exact }
}

/** Inverse of the capture: unscaled page-relative rect → CSS box at `scale`. */
export function paintRect(
  r: PdfRect,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  const s = scale || 1
  return {
    left: r.x * s,
    top: r.y * s,
    width: r.w * s,
    height: r.h * s,
  }
}

/** Union guard — reflow anchors have no `kind`, PDF anchors carry `kind:'pdf'`. */
export function isPdfAnchor(anchor: unknown): anchor is PdfAnchor {
  return (
    !!anchor &&
    typeof anchor === 'object' &&
    (anchor as { kind?: unknown }).kind === 'pdf'
  )
}
