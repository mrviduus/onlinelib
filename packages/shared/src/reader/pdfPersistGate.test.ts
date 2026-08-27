import { describe, it, expect } from 'vitest'
import {
  pdfGateReduce,
  PDF_GATE_INITIAL,
  PDF_JUMP_SETTLE_MS,
  type PdfGateState,
  type PdfGateEvent,
} from './pdfPersistGate'

/** Feed a sequence and return the decision for each event. */
function run(events: PdfGateEvent[], from: PdfGateState = PDF_GATE_INITIAL) {
  let state = from
  const persisted: boolean[] = []
  for (const e of events) {
    const out = pdfGateReduce(state, e)
    state = out.state
    persisted.push(out.persist)
  }
  return { state, persisted, last: persisted[persisted.length - 1] }
}

describe('pdfPersistGate', () => {
  it('saves a page the reader scrolled to', () => {
    const { last, state } = run([
      { type: 'documentLoaded' },
      { type: 'noJumpNeeded' },
      { type: 'pageReported', page: 4, at: 1000 },
    ])
    expect(last).toBe(true)
    expect(state.phase).toBe('live')
  })

  it('saves a page BEHIND the one before it', () => {
    // Read this as the argument against a monotonic guard, not as coverage.
    // "Never save a lower page" would have masked the page-1 bug and broken
    // re-reading, backward TOC jumps and bookmark navigation with it. A reader
    // who turns back to page 3 must have page 3 saved.
    const { last } = run([
      { type: 'documentLoaded' },
      { type: 'noJumpNeeded' },
      { type: 'pageReported', page: 20, at: 1000 },
      { type: 'pageReported', page: 3, at: 2000 },
    ])
    expect(last).toBe(true)
  })

  it('ignores the page-1 report of a freshly loaded document', () => {
    // The whole incident in four lines. The document reloaded (bars toggled),
    // pdf.js reopened at page 1 and reported it, and that overwrote page 17.
    const { last } = run([
      { type: 'documentLoaded' },
      { type: 'noJumpNeeded' },
      { type: 'pageReported', page: 17, at: 1000 },
      { type: 'documentLoaded' },
      { type: 'pageReported', page: 1, at: 1100 },
    ])
    expect(last).toBe(false)
  })

  it('ignores pages passed through on the way to a jump target', () => {
    const { persisted } = run([
      { type: 'documentLoaded' },
      { type: 'jumpIssued', page: 17, jumpId: 1, at: 0 },
      { type: 'pageReported', page: 1, at: 50 },
      { type: 'pageReported', page: 9, at: 100 },
      { type: 'pageReported', page: 17, at: 200 },
    ])
    expect(persisted).toEqual([false, false, false, false, true])
  })

  it('accepts landing one page short of the target', () => {
    // Not slack for its own sake: the viewer's IntersectionObserver uses
    // rootMargin 300px and reports the minimum of the visible set, so it honestly
    // says 16 right after landing on 17. Demanding an exact match would strand
    // the gate in `jumping` after every jump and stop saving altogether.
    const { last, state } = run([
      { type: 'documentLoaded' },
      { type: 'jumpIssued', page: 17, jumpId: 1, at: 0 },
      { type: 'pageReported', page: 16, at: 200 },
    ])
    expect(last).toBe(true)
    expect(state.phase).toBe('live')
  })

  it('trusts a matching acknowledgement over the position heuristic', () => {
    const { last } = run([
      { type: 'documentLoaded' },
      { type: 'jumpIssued', page: 90, jumpId: 7, at: 0 },
      { type: 'pageReported', page: 88, ackJumpId: 7, at: 100 },
    ])
    expect(last).toBe(true)
  })

  it('rejects an acknowledgement from a superseded jump', () => {
    // Two jumps in quick succession: the first one's ack must not open the gate
    // for the second one's fly-past.
    const { persisted } = run([
      { type: 'documentLoaded' },
      { type: 'jumpIssued', page: 17, jumpId: 1, at: 0 },
      { type: 'jumpIssued', page: 90, jumpId: 2, at: 10 },
      { type: 'pageReported', page: 17, ackJumpId: 1, at: 100 },
    ])
    expect(persisted[persisted.length - 1]).toBe(false)
  })

  it('gives up waiting rather than disabling saves forever', () => {
    // A jump that can never land — a page dropped by a re-parse, a message the
    // viewer never got — must not silently cost the reader every future save.
    const { last, state } = run([
      { type: 'documentLoaded' },
      { type: 'jumpIssued', page: 400, jumpId: 1, at: 0 },
      { type: 'pageReported', page: 2, at: PDF_JUMP_SETTLE_MS + 1 },
    ])
    expect(last).toBe(true)
    expect(state.phase).toBe('live')
  })

  it('re-arms on a table-of-contents jump from a live document', () => {
    const { persisted } = run([
      { type: 'documentLoaded' },
      { type: 'noJumpNeeded' },
      { type: 'pageReported', page: 5, at: 100 },
      { type: 'jumpIssued', page: 90, jumpId: 3, at: 200 },
      { type: 'pageReported', page: 45, at: 250 },
      { type: 'pageReported', page: 90, at: 400 },
    ])
    expect(persisted).toEqual([false, false, true, false, false, true])
  })

  it('closes again when a new document loads', () => {
    const { state } = run([
      { type: 'documentLoaded' },
      { type: 'noJumpNeeded' },
      { type: 'pageReported', page: 5, at: 100 },
      { type: 'documentLoaded' },
    ])
    expect(state.phase).toBe('awaitingTarget')
  })

  it('saves nothing before the document has loaded', () => {
    // Defensive: a report cannot arrive first in practice, but the initial state
    // must not be a permissive one.
    const { last } = run([{ type: 'pageReported', page: 1, at: 0 }])
    expect(last).toBe(false)
  })
})
