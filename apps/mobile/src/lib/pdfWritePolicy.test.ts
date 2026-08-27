import { describe, it, expect } from 'vitest'
import {
  pdfFlushDecision,
  shouldFlushOnClose,
  PDF_FLUSH_DEBOUNCE_MS,
  PDF_FLUSH_MAX_WAIT_MS,
} from './pdfWritePolicy'

describe('pdfFlushDecision', () => {
  it('waits out the quiet period', () => {
    expect(pdfFlushDecision({
      pendingPage: 12, lastWrittenPage: 3, pendingSince: 0, now: PDF_FLUSH_DEBOUNCE_MS - 1,
    })).toBe('defer')
  })

  it('writes once the reader stops turning pages', () => {
    expect(pdfFlushDecision({
      pendingPage: 12, lastWrittenPage: 3, pendingSince: 0, now: PDF_FLUSH_DEBOUNCE_MS,
    })).toBe('flush')
  })

  it('writes eventually even while the reader keeps moving', () => {
    // The bug this guard exists for: the debounce was re-armed on every page
    // tick, so someone skimming faster than one page per two seconds never
    // reached a flush and their position was saved only on close.
    expect(pdfFlushDecision({
      pendingPage: 40, lastWrittenPage: 3, pendingSince: 0, now: PDF_FLUSH_MAX_WAIT_MS,
    })).toBe('flush')
  })

  it('skips a write that would change nothing', () => {
    // Same page re-reported. Writing churns updatedAt, which is exactly the
    // field the server compares to reject stale writes.
    expect(pdfFlushDecision({
      pendingPage: 12, lastWrittenPage: 12, pendingSince: 0, now: 99_999,
    })).toBe('skip')
  })

  it('skips when nothing is pending', () => {
    expect(pdfFlushDecision({
      pendingPage: null, lastWrittenPage: 12, pendingSince: null, now: 1000,
    })).toBe('skip')
  })

  it('writes page 1 when the reader genuinely went back to it', () => {
    // Page 1 is not cursed. It was only ever wrong when it came from a reload,
    // and that is now filtered by provenance, upstream of this decision.
    expect(pdfFlushDecision({
      pendingPage: 1, lastWrittenPage: 17, pendingSince: 0, now: PDF_FLUSH_DEBOUNCE_MS,
    })).toBe('flush')
  })
})

describe('shouldFlushOnClose', () => {
  it('writes the last position when the reader actually read', () => {
    expect(shouldFlushOnClose({ pendingPage: 17, lastWrittenPage: 12, acceptedAnyPage: true })).toBe(true)
  })

  it('writes nothing when the reader closed during a jump', () => {
    // Nothing was ever accepted for this document, so there is no position to
    // record — writing one would save wherever the viewer was passing through.
    expect(shouldFlushOnClose({ pendingPage: 1, lastWrittenPage: null, acceptedAnyPage: false })).toBe(false)
  })

  it('writes nothing when the last position is already on the server', () => {
    expect(shouldFlushOnClose({ pendingPage: 17, lastWrittenPage: 17, acceptedAnyPage: true })).toBe(false)
  })
})
