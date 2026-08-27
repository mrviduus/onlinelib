import { describe, it, expect } from 'vitest'
import { citationLabel } from './citation'

const chapters = [
  { chapterNumber: 0, title: 'Book I' },
  { chapterNumber: 1, title: 'Book II' },
]

describe('citationLabel', () => {
  it('names the chapter rather than its stored ordinal', () => {
    // The defect verbatim: six chips all reading "ch.0" under an answer about Book I.
    expect(citationLabel({ marker: 6, chapterOrd: 0 }, chapters)).toBe('[6] Book I')
  })

  it('carries the marker so [n] in the answer can be found below it', () => {
    expect(citationLabel({ marker: 13, chapterOrd: 1 }, chapters)).toBe('[13] Book II')
  })

  it('falls back to a 1-based number when the chapter list is not to hand', () => {
    // ch.0 is the first chapter, not a missing value — so the fallback must not print the raw ord.
    expect(citationLabel({ marker: 1, chapterOrd: 0 })).toBe('[1] ch.1')
    expect(citationLabel({ chapterOrd: 3 })).toBe('ch.4')
  })

  it('prefers a page for an unanchored PDF citation', () => {
    expect(citationLabel({ marker: 2, chapterOrd: 0, sourcePage: 12 }, chapters)).toBe('[2] p.12')
  })

  it('survives a citation with neither chapter nor page', () => {
    expect(citationLabel({ marker: 4 })).toBe('[4]')
    expect(citationLabel({})).toBe('—')
  })

  it('ignores a blank chapter title rather than rendering an empty chip', () => {
    expect(citationLabel({ marker: 1, chapterOrd: 0 }, [{ chapterNumber: 0, title: '  ' }]))
      .toBe('[1] ch.1')
  })
})
