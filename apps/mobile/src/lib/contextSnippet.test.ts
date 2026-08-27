import { describe, it, expect } from 'vitest'
import { buildContextSnippet, SNIPPET_PREFIX_CHARS } from './contextSnippet'

// The paragraph QA actually saved from — Dryden's Aeneid, stored as a block of
// prose because extractSentence takes 500 characters of the block ancestor
// rather than a sentence.
const PARAGRAPH =
  "O Muse! the causes and the crimes relate; What goddess was provok'd, and whence her hate; " +
  "For what offense the Queen of Heav'n began To persecute so brave, so just a man."

describe('buildContextSnippet', () => {
  it('keeps the word visible when it sits deep in a paragraph', () => {
    // The reported bug: the row showed "…d the crimes relate;…" and no goddess.
    const s = buildContextSnippet(PARAGRAPH, 'goddess')
    expect(s).not.toBeNull()
    expect(s!.match).toBe('goddess')
    expect(s!.before.length).toBeLessThanOrEqual(SNIPPET_PREFIX_CHARS + 1) // +1 for the ellipsis
  })

  it('spends its budget forward, not backward', () => {
    // Reading continues to the right, so that is where the useful context is.
    const s = buildContextSnippet(PARAGRAPH, 'goddess')!
    expect(s.after.length).toBeGreaterThan(s.before.length)
    expect(s.after).toContain('provok')
  })

  it('returns null rather than quoting a fragment without the word', () => {
    // The old code printed the head of the paragraph, so the row showed a quote
    // that did not contain the word it belonged to. Null lets the caller fall
    // back to the translation, which is always true.
    expect(buildContextSnippet(PARAGRAPH, 'aeneas')).toBeNull()
  })

  it('matches regardless of case', () => {
    expect(buildContextSnippet('The Queen of Heaven began', 'queen')!.match).toBe('Queen')
  })

  it('does not trim a sentence that already fits', () => {
    const s = buildContextSnippet('A short line with goddess in it', 'goddess')!
    expect(s.before).not.toContain('…')
    expect(s.after).not.toContain('…')
  })

  it('handles a word at the very start', () => {
    const s = buildContextSnippet('Goddess of the dawn, and other matters entirely', 'goddess')!
    expect(s.before).toBe('')
    expect(s.match).toBe('Goddess')
  })

  it('handles missing input without throwing', () => {
    expect(buildContextSnippet(null, 'x')).toBeNull()
    expect(buildContextSnippet('x', null)).toBeNull()
    expect(buildContextSnippet('', '')).toBeNull()
  })
})
