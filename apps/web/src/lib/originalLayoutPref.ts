// Per-book "Original layout" opt-in, remembered in localStorage.
// Reflow stays the default; Original mode is only offered for user-uploaded
// books that carry an original PDF (mode==='userbook' && hasOriginalPdf).

const LAYOUT_KEY = (bookId: string) => `reader.originalLayout.${bookId}`
const PAGE_KEY = (bookId: string) => `reader.pdfPage.${bookId}`

export function readOriginalLayout(bookId: string): boolean {
  try {
    return localStorage.getItem(LAYOUT_KEY(bookId)) === '1'
  } catch {
    return false
  }
}

export function writeOriginalLayout(bookId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(LAYOUT_KEY(bookId), '1')
    else localStorage.removeItem(LAYOUT_KEY(bookId))
  } catch {
    /* private mode / quota — best effort */
  }
}

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
