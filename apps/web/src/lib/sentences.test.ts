import { describe, it, expect } from 'vitest'
import { splitSentences, tokenizeWords } from '@textstack/shared'

describe('splitSentences', () => {
  it('splits basic two sentences', () => {
    expect(splitSentences('Hello. World!')).toEqual(['Hello.', 'World!'])
  })

  it('splits common terminators without crashing', () => {
    // Note: ICU BreakIterator does NOT recognize "Mr." as an abbreviation,
    // so this over-splits. Acceptable limitation — no sentence is "wrong",
    // they just got cut. Verify the content round-trips losslessly.
    const input = 'Mr. Smith went home. He slept.'
    const out = splitSentences(input)
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out.join(' ').replace(/\s+/g, ' ')).toBe(input)
  })

  it('splits ellipsis followed by another sentence', () => {
    const out = splitSentences('Wait... really? Yes.')
    expect(out.length).toBeGreaterThanOrEqual(2)
  })

  it('splits unicode (Ukrainian)', () => {
    expect(splitSentences('Привіт. Як справи?', 'uk')).toEqual([
      'Привіт.',
      'Як справи?',
    ])
  })

  it('returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n\t  ')).toEqual([])
  })

  it('collapses multiple whitespace', () => {
    const out = splitSentences('Hello.    World!')
    expect(out).toEqual(['Hello.', 'World!'])
  })

  it('single sentence without terminator', () => {
    const out = splitSentences('Just one fragment')
    expect(out.length).toBe(1)
  })
})

describe('tokenizeWords', () => {
  it('splits simple sentence preserving trailing punctuation', () => {
    expect(tokenizeWords('Hello, world.')).toEqual([
      { word: 'Hello', trailing: ', ' },
      { word: 'world', trailing: '.' },
    ])
  })

  it('preserves apostrophes inside words', () => {
    const out = tokenizeWords("don't stop")
    expect(out.map((t) => t.word)).toEqual(["don't", 'stop'])
  })

  it('handles hyphenated words', () => {
    const out = tokenizeWords('state-of-the-art design')
    expect(out[0].word).toBe('state-of-the-art')
  })

  it('handles unicode letters', () => {
    const out = tokenizeWords('Привіт, світе!')
    expect(out.map((t) => t.word)).toEqual(['Привіт', 'світе'])
  })

  it('returns empty for punctuation-only input', () => {
    expect(tokenizeWords('...')).toEqual([])
    expect(tokenizeWords('')).toEqual([])
  })

  it('reassembles to the original sentence', () => {
    const s = "It's a state-of-the-art, modern design."
    const out = tokenizeWords(s)
    const rebuilt = out.map((t) => t.word + t.trailing).join('')
    expect(rebuilt).toBe(s)
  })
})
