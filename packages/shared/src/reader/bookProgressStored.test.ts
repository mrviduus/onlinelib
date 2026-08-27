import { describe, it, expect } from 'vitest'
import { storedBookPercent, formatBookPercent } from './bookProgress'

describe('storedBookPercent', () => {
  it('reads the stored number through, untouched', () => {
    expect(storedBookPercent({ percent: 0.139 })).toBe(0.139)
  })

  it('is null when there is no progress row', () => {
    expect(storedBookPercent(null)).toBeNull()
    expect(storedBookPercent(undefined)).toBeNull()
  })

  it('is null — not zero — when the row carries no percent', () => {
    // The distinction the detail screen collapsed. A chapterless PDF stores a
    // real percent and a null chapterSlug; deriving from the slug produced 0%
    // for a book the list correctly showed at 14%.
    expect(storedBookPercent({ percent: null })).toBeNull()
    expect(storedBookPercent({})).toBeNull()
  })

  it('rejects a value that is not a finite number', () => {
    expect(storedBookPercent({ percent: NaN })).toBeNull()
    expect(storedBookPercent({ percent: Infinity })).toBeNull()
  })

  it('keeps a genuine zero', () => {
    expect(storedBookPercent({ percent: 0 })).toBe(0)
  })
})

describe('formatBookPercent', () => {
  it('renders an unknown percentage as a dash, never as zero', () => {
    // "I don't know how far you are" and "you have read none of it" are
    // different statements, and only one of them is true.
    expect(formatBookPercent(null)).toBe('—')
  })

  it('renders a real zero as zero', () => {
    // A book opened at the top is not a book never opened.
    expect(formatBookPercent(0)).toBe('0%')
  })

  it('rounds the way the library row does', () => {
    expect(formatBookPercent(0.139)).toBe('14%')
    expect(formatBookPercent(1)).toBe('100%')
  })
})
