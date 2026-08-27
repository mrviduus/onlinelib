import { describe, it, expect } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(1, 'word', 'words')).toBe('1 word')
    expect(plural(2, 'word', 'words')).toBe('2 words')
  })

  it('treats zero as many, which English does', () => {
    // "0 words added" — the bug report was "1 words", but zero is the case a naive
    // `n > 1 ? plural : singular` gets wrong in the other direction.
    expect(plural(0, 'word', 'words')).toBe('0 words')
  })

  it('takes a sentence template, so the count need not lead', () => {
    expect(plural(1, 'highlight', 'highlights', 'You revisited {n} {noun}'))
      .toBe('You revisited 1 highlight')
    expect(plural(3, 'highlight', 'highlights', 'You revisited {n} {noun}'))
      .toBe('You revisited 3 highlights')
  })

  it('handles a negative count without inventing a singular', () => {
    // Not expected, but clocks skew and counters get subtracted; -1 must not read as "-1 word".
    expect(plural(-1, 'word', 'words')).toBe('-1 words')
  })
})
