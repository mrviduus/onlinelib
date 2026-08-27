import { describe, it, expect } from 'vitest'
import { anchorContextSnippet, buildContextSnippet, SNIPPET_PREFIX_CHARS } from './contextSnippet'

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

describe('anchorContextSnippet', () => {
  const anchor = (a: Record<string, unknown>) => JSON.stringify(a)

  it('reads the context a highlight already stored', () => {
    // The exact shape a reflow highlight saves: ~30 chars either side of the passage.
    const json = anchor({
      prefix: 'Arms, and the man I sing, who ',
      exact: 'forc',
      suffix: "'d by fate, and haughty Juno's",
      startOffset: 30,
      endOffset: 34,
    })

    const snippet = anchorContextSnippet(json, 'forc')

    expect(snippet).not.toBeNull()
    expect(snippet!.match).toBe('forc')
    expect(snippet!.before).toContain('who')
    expect(snippet!.after).toContain('fate')
  })

  it('returns null for an anchor with no surrounding text', () => {
    // PDF-rect anchors and the old no-anchor fallback carry only `exact`. Rendering a "quote"
    // that is just the fragment again is exactly the emptiness this replaces.
    expect(anchorContextSnippet(anchor({ exact: 'in' }), 'in')).toBeNull()
    expect(anchorContextSnippet(anchor({ kind: 'pdf', page: 4, exact: 'in' }), 'in')).toBeNull()
  })

  it('survives a missing or malformed anchor rather than throwing', () => {
    expect(anchorContextSnippet(null, 'in')).toBeNull()
    expect(anchorContextSnippet('{not json', 'in')).toBeNull()
  })

  it('falls back to the anchor exact when the row carries no selected text', () => {
    const json = anchor({ prefix: 'a long lead-in of text ', exact: 'here', suffix: ' and after' })
    expect(anchorContextSnippet(json, null)!.match).toBe('here')
  })
})
