// Resume-only PDF page position for the Original-layout view, remembered in
// localStorage. NOT synced to server progress (word-based). The old per-book
// "Original layout" opt-in was removed in ADR-012 — Original is now the default
// for user-uploaded PDFs, so there's no layout preference to persist.

const PAGE_KEY = (bookId: string) => `reader.pdfPage.${bookId}`

/** Resume-only PDF page position. NOT synced to server progress. */
export function readPdfPage(bookId: string): number | null {
  try {
    const raw = localStorage.getItem(PAGE_KEY(bookId))
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 1 ? n : null
  } catch {
    return null
  }
}

export function writePdfPage(bookId: string, page: number): void {
  try {
    localStorage.setItem(PAGE_KEY(bookId), String(page))
  } catch {
    /* best effort */
  }
}
