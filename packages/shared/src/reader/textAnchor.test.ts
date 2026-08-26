import { describe, it, expect } from 'vitest'
import {
  findAnchorOffset,
  similarity,
  ANCHOR_CONTEXT_LENGTH,
  type TextAnchor,
} from './textAnchor'

const anchor = (o: Partial<TextAnchor> & { exact: string }): TextAnchor => ({
  prefix: '',
  suffix: '',
  startOffset: -1,
  endOffset: -1,
  ...o,
})

describe('similarity', () => {
  it('is 1 for identical strings and 0 when either is empty', () => {
    expect(similarity('hello', 'hello')).toBe(1)
    expect(similarity('', 'hello')).toBe(0)
    expect(similarity('hello', '')).toBe(0)
  })

  it('ignores case', () => {
    expect(similarity('Hello There', 'hello there')).toBe(1)
  })

  it('degrades gracefully rather than failing on an edit', () => {
    // A typo should move the score, not collapse it — book text gets edited.
    expect(similarity('the quick brown fox', 'the qiuck brown fox')).toBeGreaterThan(0.7)
    expect(similarity('the quick brown fox', 'entirely different')).toBeLessThan(0.3)
  })

  it('is 0 for single characters, which have no bigrams', () => {
    expect(similarity('a', 'b')).toBe(0)
  })
})

describe('findAnchorOffset — exact context', () => {
  const text = 'Call me Ishmael. Some years ago, never mind how long precisely, having little money.'

  it('finds the passage using prefix and suffix', () => {
    const i = findAnchorOffset(text, anchor({ prefix: 'Call me ', exact: 'Ishmael', suffix: '. Some' }))
    expect(i).toBe(text.indexOf('Ishmael'))
  })

  it('finds it with only a prefix, or only a suffix', () => {
    expect(findAnchorOffset(text, anchor({ prefix: 'Call me ', exact: 'Ishmael' })))
      .toBe(text.indexOf('Ishmael'))
    expect(findAnchorOffset(text, anchor({ exact: 'Ishmael', suffix: '. Some years' })))
      .toBe(text.indexOf('Ishmael'))
  })

  it('finds a passage with no context at all', () => {
    expect(findAnchorOffset(text, anchor({ exact: 'never mind' }))).toBe(text.indexOf('never mind'))
  })
})

describe('findAnchorOffset — the passage occurs more than once', () => {
  // "the sea" three times; only the middle one is preceded by "beneath".
  const text = 'the sea was calm. Far beneath the sea lay silence. Above the sea, gulls.'

  it('picks the occurrence whose surroundings match', () => {
    const i = findAnchorOffset(text, anchor({
      prefix: 'Far beneath ', exact: 'the sea', suffix: ' lay silence',
    }))
    expect(i).toBe(text.indexOf('Far beneath the sea') + 'Far beneath '.length)
  })

  it('still returns an occurrence when no context matches any of them', () => {
    // Better a plausible location than none: a highlight that fails to anchor
    // simply disappears for the reader.
    const i = findAnchorOffset(text, anchor({ prefix: 'zzz', exact: 'the sea', suffix: 'qqq' }))
    expect(i).not.toBeNull()
    expect(text.slice(i!, i! + 7)).toBe('the sea')
  })
})

describe('findAnchorOffset — the document changed', () => {
  it('survives text inserted before the passage, which invalidates the offsets', () => {
    // This is the whole point: a re-parse or an edit shifts every index.
    const text = 'A newly added foreword. Call me Ishmael, and mind the gap.'
    const i = findAnchorOffset(text, anchor({
      prefix: 'Call me ', exact: 'Ishmael', suffix: ', and mind',
      startOffset: 8, endOffset: 15, // where it used to be
    }))
    expect(i).toBe(text.indexOf('Ishmael'))
  })

  it('falls back to the stored offsets when the text there still matches', () => {
    const text = 'Call me Ishmael, and mind the gap.'
    const start = text.indexOf('Ishmael')
    // Context that no longer exists anywhere, so only the offsets can answer.
    const i = findAnchorOffset(text, anchor({
      prefix: 'DELETED PARAGRAPH ', exact: 'Ishmael', suffix: ' DELETED TOO',
      startOffset: start, endOffset: start + 7,
    }))
    expect(i).toBe(start)
  })

  it('tolerates a typo introduced into a passage long enough to still be recognisable', () => {
    // Dice similarity over bigrams: a single transposition in a sentence still
    // scores ~0.91, comfortably over the 0.75 floor.
    const text = 'Some years ago, having little or no moeny in my purse, I thought I would sail.'
    const i = findAnchorOffset(text, anchor({ exact: 'having little or no money in my purse' }))
    expect(i).toBe(text.indexOf('having little'))
  })

  it('refuses a short passage with a transposition, by design', () => {
    // "Ishmael" vs "Ishmeal" scores 0.50 — under the floor. The threshold was
    // deliberately raised from 0.6 to 0.75 after OCR'd books drifted anchors
    // onto a similar-looking word elsewhere in the chapter, and a short word
    // has too few bigrams to survive that. Losing a highlight is better than
    // silently moving it somewhere the reader never marked.
    expect(findAnchorOffset('Call me Ishmeal, and mind the gap.', anchor({ exact: 'Ishmael' }))).toBeNull()
  })

  it('refuses a match that is merely similar-looking', () => {
    expect(findAnchorOffset('completely unrelated prose here', anchor({ exact: 'Ishmael' }))).toBeNull()
  })

  it('does not fuzzy-match a long passage', () => {
    // The scan is quadratic, and a long passage rarely drifts.
    const long = 'x'.repeat(120)
    expect(findAnchorOffset('y'.repeat(500), anchor({ exact: long }))).toBeNull()
  })
})

describe('findAnchorOffset — degenerate input', () => {
  it('returns null rather than throwing', () => {
    expect(findAnchorOffset('', anchor({ exact: 'x' }))).toBeNull()
    expect(findAnchorOffset('some text', anchor({ exact: '' }))).toBeNull()
    // Offsets outside the document must not be dereferenced.
    expect(findAnchorOffset('short', anchor({ exact: 'zzz', startOffset: 900, endOffset: 950 }))).toBeNull()
    expect(findAnchorOffset('short', anchor({ exact: 'zzz', startOffset: -5, endOffset: -1 }))).toBeNull()
  })

  it('treats missing prefix and suffix as empty', () => {
    const partial = { exact: 'Ishmael', startOffset: -1, endOffset: -1 } as TextAnchor
    expect(findAnchorOffset('Call me Ishmael.', partial)).toBe(8)
  })
})

describe('the context length is a cross-platform contract', () => {
  it('is 30 — both creators must capture the same amount', () => {
    // Mobile captured 50 while web compared 30, so anchors made on the phone
    // scored worse when the same book was opened on the web.
    expect(ANCHOR_CONTEXT_LENGTH).toBe(30)
  })
})
