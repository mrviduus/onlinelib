// Page-based server progress for the Original-layout PDF view (ADR-012 S2).
//
// A user PDF opens chapterless, so its reading position is a PAGE fraction that
// is persisted into the SAME word-based `ProgressPercent` field (0..1) the
// reflow reader writes — the library card renders one number regardless of
// format, and continue-reading resumes to the right page cross-device.
//
// Kept free of DOM/pdfjs so the payload builder + locator parse are unit-tested
// in isolation.

import { PERCENT_UNIT_BOOK } from './progressPayload'
import { LOCATOR_SPACE_PAGE, type LocatorSpaceKind } from './locatorSpace'

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export interface PdfProgressPayload {
  /** Chapterless — a PDF read in Original layout has no chapter slug. */
  chapterSlug: null
  /** "page:<N>" — parsed on resume to restore the scroll position. */
  locator: string
  /** currentPage / numPages, clamped to [0,1]. */
  percent: number
  /** Declares what `percent` is a fraction of; the server stores it only when
   *  this says "book". */
  percentUnit: string
  /** The coordinate space `locator` is written in. Always 'page' here. */
  locatorKind: LocatorSpaceKind
  updatedAt: string
}

/**
 * Build the server progress upsert body for a PDF page position. `percent` is a
 * plain page fraction (NOT word-based) so it lands in the same `ProgressPercent`
 * column without double-counting the reflow path.
 */
export function buildPdfProgressPayload(
  currentPage: number,
  numPages: number,
  now: number = Date.now(),
): PdfProgressPayload {
  const page = Number.isFinite(currentPage) ? Math.max(1, Math.floor(currentPage)) : 1
  const percent = numPages >= 1 ? clamp01(page / numPages) : 0
  return {
    chapterSlug: null,
    locator: `page:${page}`,
    percent,
    // A page fraction IS a book fraction for a chapterless PDF, so this is a
    // genuine book-wide value and says so.
    percentUnit: PERCENT_UNIT_BOOK,
    locatorKind: LOCATOR_SPACE_PAGE,
    updatedAt: new Date(now).toISOString(),
  }
}

/** Parse a "page:<N>" locator back to a 1-based page. Null if not a page locator. */
export function parsePdfPageLocator(locator: string | null | undefined): number | null {
  if (!locator) return null
  const m = /^page:(\d+)$/.exec(locator.trim())
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}
