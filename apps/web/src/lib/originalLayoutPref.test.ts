import { describe, it, expect, beforeEach } from 'vitest'
import {
  readOriginalLayout,
  writeOriginalLayout,
  readPdfPage,
  writePdfPage,
} from './originalLayoutPref'

describe('originalLayoutPref (per-book persistence)', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to reflow (false) for an unknown book', () => {
    expect(readOriginalLayout('book-1')).toBe(false)
  })

  it('remembers the opt-in per book', () => {
    writeOriginalLayout('book-1', true)
    expect(readOriginalLayout('book-1')).toBe(true)
    // other books unaffected
    expect(readOriginalLayout('book-2')).toBe(false)
  })

  it('clears the flag when toggled off (no stale key)', () => {
    writeOriginalLayout('book-1', true)
    writeOriginalLayout('book-1', false)
    expect(readOriginalLayout('book-1')).toBe(false)
    expect(localStorage.getItem('reader.originalLayout.book-1')).toBeNull()
  })

  it('round-trips the resume page position', () => {
    expect(readPdfPage('book-1')).toBeNull()
    writePdfPage('book-1', 12)
    expect(readPdfPage('book-1')).toBe(12)
  })

  it('rejects invalid / non-positive stored pages', () => {
    localStorage.setItem('reader.pdfPage.book-1', 'not-a-number')
    expect(readPdfPage('book-1')).toBeNull()
    localStorage.setItem('reader.pdfPage.book-1', '0')
    expect(readPdfPage('book-1')).toBeNull()
  })
})
