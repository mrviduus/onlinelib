/**
 * When a pending PDF page should actually be written to the server.
 *
 * The debounce was re-armed on every page tick, so a reader turning pages faster
 * than once every two seconds — which is what skimming looks like — never
 * reached a flush at all. Their position was saved only when they slowed down or
 * closed the reader. Two guards fix that without turning the reader into a
 * chatty client: a maximum wait, and a skip for writes that would change nothing.
 *
 * Provenance is decided elsewhere (`pdfPersistGate`); by the time a page reaches
 * this function it is already known to be a place the reader chose to be.
 */

/** Quiet period after the last page change before writing. */
export const PDF_FLUSH_DEBOUNCE_MS = 2000

/** Longest a position may go unwritten while the reader keeps turning pages. */
export const PDF_FLUSH_MAX_WAIT_MS = 10_000

export interface PdfFlushInput {
  /** Page waiting to be written, or null when nothing is pending. */
  pendingPage: number | null
  /** Last page successfully written for this book, or null if none yet. */
  lastWrittenPage: number | null
  /** When `pendingPage` first became pending — NOT when it was last updated. */
  pendingSince: number | null
  now: number
}

export type PdfFlushDecision =
  /** Write it now. */
  | 'flush'
  /** Something is pending but the quiet period has not elapsed. */
  | 'defer'
  /** Nothing worth writing. */
  | 'skip'

export function pdfFlushDecision(s: PdfFlushInput): PdfFlushDecision {
  if (s.pendingPage == null || s.pendingSince == null) return 'skip'
  // Re-writing the same page churns updatedAt for no reader-visible gain, and
  // updatedAt is what the server's last-write-wins check compares.
  if (s.pendingPage === s.lastWrittenPage) return 'skip'
  const waited = s.now - s.pendingSince
  if (waited >= PDF_FLUSH_MAX_WAIT_MS) return 'flush'
  if (waited >= PDF_FLUSH_DEBOUNCE_MS) return 'flush'
  return 'defer'
}

/**
 * Whether a final write on reader close is worth making.
 *
 * Closing during the jump window means nothing was ever accepted for this
 * document, and there is no legitimate position to record — writing one would
 * put the reader back where the viewer happened to be passing through.
 */
export function shouldFlushOnClose(s: {
  pendingPage: number | null
  lastWrittenPage: number | null
  acceptedAnyPage: boolean
}): boolean {
  if (!s.acceptedAnyPage) return false
  if (s.pendingPage == null) return false
  return s.pendingPage !== s.lastWrittenPage
}
