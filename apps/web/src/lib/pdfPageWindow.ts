// Pure virtualization math for the Original-layout PDF view.
//
// A 100-page / 21MB PDF cannot keep every page canvas in memory — off-screen
// pages MUST be unmounted or the tab OOMs. Given the set of currently-visible
// page numbers (reported by an IntersectionObserver), we derive two rings:
//   - render ring (±1): pages whose canvas + text layer should be drawn now.
//   - keep ring   (±2): pages whose already-drawn canvas may be retained to
//     avoid flicker on small scrolls. Anything outside the keep ring is freed.
//
// Kept intentionally free of DOM/pdfjs so it can be unit-tested in isolation.

/** Pages within `radius` of any visible page, clamped to [1, numPages]. */
export function pagesInRange(
  visible: Iterable<number>,
  radius: number,
  numPages: number,
): Set<number> {
  const out = new Set<number>()
  for (const v of visible) {
    const start = Math.max(1, v - radius)
    const end = Math.min(numPages, v + radius)
    for (let p = start; p <= end; p++) out.add(p)
  }
  return out
}

export interface PageRings {
  /** ±1 — draw canvas + text layer. */
  render: Set<number>
  /** ±2 — retain an already-drawn canvas (don't free yet). */
  keep: Set<number>
}

export function computePageRings(
  visible: Iterable<number>,
  numPages: number,
  renderRadius = 1,
  keepRadius = 2,
): PageRings {
  const visArr = [...visible]
  return {
    render: pagesInRange(visArr, renderRadius, numPages),
    keep: pagesInRange(visArr, keepRadius, numPages),
  }
}

/** Topmost visible page (for resume persistence + toolbar readout). */
export function topVisiblePage(visible: Iterable<number>, fallback: number): number {
  let min = Infinity
  for (const v of visible) if (v < min) min = v
  return min === Infinity ? fallback : min
}

/**
 * Clamp a (possibly stale / overflow) page request into [1, numPages]. When the
 * page count isn't known yet (numPages < 1) we only floor to >= 1 so an early
 * jump still targets a sensible page.
 */
export function clampPage(page: number, numPages: number): number {
  if (!Number.isFinite(page)) return 1
  const floored = Math.max(1, Math.floor(page))
  if (numPages < 1) return floored
  return Math.min(numPages, floored)
}

/**
 * The chapter's start page (initialPage) wins when set — the user chose "open
 * this chapter's page". The persisted resume page is only a fallback (e.g. the
 * chapter carried no sourceStartPage). Defaults to page 1.
 */
export function resolveOpenPage(
  initialPage: number | null | undefined,
  resumePage: number | null | undefined,
): number {
  if (initialPage != null && initialPage >= 1) return Math.floor(initialPage)
  if (resumePage != null && resumePage >= 1) return Math.floor(resumePage)
  return 1
}

/**
 * True once the placeholder heights of every page ABOVE the target have
 * streamed in — i.e. the target's scroll offset has stopped shifting, so a
 * correction re-scroll will land precisely. Any jump (initial open, TOC, or
 * page-input) gates its one-shot correction on this.
 */
export function dimsReadyUpTo(
  dims: readonly (unknown | undefined)[],
  targetPage: number,
): boolean {
  if (dims.length === 0) return false
  const upto = Math.min(Math.max(1, targetPage), dims.length)
  for (let i = 0; i < upto; i++) {
    if (!dims[i]) return false
  }
  return true
}
