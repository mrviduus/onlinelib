import { describe, it, expect } from 'vitest'
import { canPersistPosition, type ReaderWriteGateInput } from './readerWriteGate'

const base: ReaderWriteGateInput = {
  enabled: true,
  bookKey: 'edition-1',
  chapterSlug: '2-act-i',
  restoredFor: '2-act-i',
}

describe('canPersistPosition', () => {
  it('allows a write once this chapter has been restored', () => {
    expect(canPersistPosition(base)).toBe(true)
  })

  it('refuses the write that destroyed a reader position', () => {
    // The WebView posts progress on its own `load` event, scrollY 0, before any restore has been
    // injected and with no user action. That message reached the server as
    // `scroll:1-dramatis-personae:0`, percent 0, over a reader who was 10% into chapter two.
    expect(canPersistPosition({ ...base, restoredFor: null })).toBe(false)
  })

  it('refuses a write meant for the chapter just left', () => {
    // Moving on starts a new restore. A single boolean would still be true here and would persist
    // the destination chapter at the top.
    expect(canPersistPosition({ ...base, chapterSlug: '3-act-ii', restoredFor: '2-act-i' })).toBe(false)
  })

  it('opens the gate when there was nothing to restore', () => {
    // A book opened for the first time completes its restore by staying at the top. Treating that
    // as "not restored yet" would mean a first read could never be saved.
    expect(canPersistPosition({ ...base, chapterSlug: 'ch-1', restoredFor: 'ch-1' })).toBe(true)
  })

  it('still refuses when another viewer owns the position', () => {
    // Original-layout PDF: the reflow refs were never written, and writing them destroys a real
    // page locator. This check predates the restore gate and is not replaced by it.
    expect(canPersistPosition({ ...base, enabled: false })).toBe(false)
  })

  it('refuses before the book id resolves', () => {
    expect(canPersistPosition({ ...base, bookKey: null })).toBe(false)
    expect(canPersistPosition({ ...base, chapterSlug: null })).toBe(false)
  })
})
