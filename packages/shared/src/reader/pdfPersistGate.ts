/**
 * Decides whether a page the PDF viewer just reported is a place the reader
 * chose to be — and therefore whether it may be saved as their position.
 *
 * The old answer was a boolean, `pdfInitialJumpDoneRef`. It was set at line 374
 * of ReaderShell, the jump target was computed at 375-380, and the fire-and-forget
 * `scrollPdfToPage` went out at 381. So the gate opened while the viewer was
 * still sitting on page 1, and the page-1 report sailed through the guard whose
 * comment said it existed to stop exactly that. A second branch opened the gate
 * having issued no scroll at all, and nothing ever closed it again — not on
 * reload, not on book change.
 *
 * Provenance, not ordering, is the right question. A page is saveable when the
 * reader navigated to it or read to it; it is not saveable when the viewer is
 * merely passing through on its way somewhere, or has just reopened a document
 * at the top. So this is a small state machine over the life of one document.
 *
 * **A monotonic guard would be the wrong fix.** "Never save a lower page" is
 * tempting and would have masked this bug, but it breaks re-reading, backward
 * TOC jumps and bookmark navigation — a reader who goes back to page 3 must have
 * page 3 saved. There is a test named for that, and it should be read as the
 * argument, not as coverage.
 */

export type PdfGatePhase = 'awaitingTarget' | 'jumping' | 'live'

export interface PdfGateState {
  phase: PdfGatePhase
  /** Page the reader is being taken to while `phase === 'jumping'`. */
  target: number | null
  /** Identifies the in-flight jump so a stale acknowledgement cannot satisfy it. */
  jumpId: number
  jumpedAt: number
}

export type PdfGateEvent =
  /** The WebView loaded a document — a fresh open, or a silent 401 reload. */
  | { type: 'documentLoaded' }
  /** A jump was issued to the viewer. Every jump, from any source. */
  | { type: 'jumpIssued'; page: number; jumpId: number; at: number }
  /** Nothing to jump to: the document opens where the reader should be. */
  | { type: 'noJumpNeeded' }
  /** The viewer reported its top visible page. */
  | { type: 'pageReported'; page: number; ackJumpId?: number; at: number }

export const PDF_GATE_INITIAL: PdfGateState = {
  phase: 'awaitingTarget',
  target: null,
  jumpId: 0,
  jumpedAt: 0,
}

/**
 * How far off the reported page may be and still count as "landed".
 *
 * Not slack for its own sake. The viewer's IntersectionObserver uses
 * `rootMargin: '300px 0px'` and reports the minimum of the visible set, so a page
 * up to 300px above the viewport counts as visible: immediately after landing on
 * 17 the viewer honestly reports 16. Requiring an exact match would leave the
 * gate stuck in `jumping` after every jump, and the reader's position would stop
 * being saved entirely.
 */
export const PDF_LANDING_TOLERANCE = 1

/**
 * How long to wait for a jump to land before giving up and saving anyway.
 *
 * The escape hatch matters more than the happy path: without it, one jump that
 * can never land (a page removed by a re-parse, a viewer that dropped the
 * message) disables position saving for the rest of the session, silently.
 */
export const PDF_JUMP_SETTLE_MS = 4000

export function pdfGateReduce(
  state: PdfGateState,
  event: PdfGateEvent,
): { state: PdfGateState; persist: boolean } {
  switch (event.type) {
    case 'documentLoaded':
      // The reset that did not exist. Absorbing: a repeat (onLoadEnd and pdfReady
      // both fire) is harmless.
      return { state: { ...PDF_GATE_INITIAL, jumpId: state.jumpId }, persist: false }

    case 'jumpIssued':
      // Re-arms from `live` too, so the pages flying past during a table-of-contents
      // jump are not mistaken for reading.
      return {
        state: { phase: 'jumping', target: event.page, jumpId: event.jumpId, jumpedAt: event.at },
        persist: false,
      }

    case 'noJumpNeeded':
      return { state: { ...state, phase: 'live', target: null }, persist: false }

    case 'pageReported': {
      if (state.phase === 'awaitingTarget') {
        // Where the page-1 report of a freshly reloaded document dies.
        return { state, persist: false }
      }
      if (state.phase === 'live') {
        // Forward or backward — both are the reader moving.
        return { state, persist: true }
      }
      // phase === 'jumping'
      const acked = event.ackJumpId != null && event.ackJumpId === state.jumpId
      const landed = state.target != null
        && Math.abs(event.page - state.target) <= PDF_LANDING_TOLERANCE
      const settled = event.at - state.jumpedAt > PDF_JUMP_SETTLE_MS
      if (acked || landed || settled) {
        return { state: { ...state, phase: 'live', target: null }, persist: true }
      }
      return { state, persist: false }
    }

    default:
      return { state, persist: false }
  }
}
