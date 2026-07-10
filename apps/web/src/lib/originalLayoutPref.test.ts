import { describe, it, expect, beforeEach } from 'vitest'
import { readPdfPage, writePdfPage } from './originalLayoutPref'

describe('originalLayoutPref (resume-only PDF page position)', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips the resume page position', () => {
    expect(readPdfPage('book-1')).toBeNull()
    writePdfPage('book-1', 12)
    expect(readPdfPage('book-1')).toBe(12)
    // other books unaffected
    expect(readPdfPage('book-2')).toBeNull()
  })

  it('rejects invalid / non-positive stored pages', () => {
    localStorage.setItem('reader.pdfPage.book-1', 'not-a-number')
    expect(readPdfPage('book-1')).toBeNull()
    localStorage.setItem('reader.pdfPage.book-1', '0')
    expect(readPdfPage('book-1')).toBeNull()
  })
})
