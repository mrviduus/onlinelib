import { describe, it, expect } from 'vitest'
import { composeQuotedQuestion, parseQuotedContent } from './bookChat'

describe('bookChat quote encoding', () => {
  it('round-trips a single-line passage', () => {
    const content = composeQuotedQuestion('the whale', 'what is this?')
    expect(content).toBe('> the whale\n\nwhat is this?')
    expect(parseQuotedContent(content)).toEqual({ quote: 'the whale', text: 'what is this?' })
  })

  it('round-trips a multi-line passage (blockquote per line)', () => {
    const passage = 'line one\nline two'
    const content = composeQuotedQuestion(passage, 'explain')
    expect(content).toBe('> line one\n> line two\n\nexplain')
    expect(parseQuotedContent(content)).toEqual({ quote: passage, text: 'explain' })
  })

  it('treats a plain message as no quote', () => {
    expect(parseQuotedContent('just a question')).toEqual({ quote: null, text: 'just a question' })
  })

  it('treats a legit ">"-leading question as plain text, not an empty quote card', () => {
    // No blank-line separator + no question remainder → must NOT become an empty quote card.
    expect(parseQuotedContent('> 5 means greater')).toEqual({ quote: null, text: '> 5 means greater' })
  })

  it('treats a blockquote with an empty trailing question as plain text', () => {
    const content = composeQuotedQuestion('passage', '') // '> passage\n\n'
    expect(parseQuotedContent(content)).toEqual({ quote: null, text: content })
  })

  it('parses a real composed quote+question into a card', () => {
    const content = composeQuotedQuestion('the whale', 'what is this?')
    expect(parseQuotedContent(content)).toEqual({ quote: 'the whale', text: 'what is this?' })
  })

  it('parses a multi-line composed quote into a card', () => {
    const content = composeQuotedQuestion('line one\nline two', 'explain')
    expect(parseQuotedContent(content)).toEqual({ quote: 'line one\nline two', text: 'explain' })
  })
})
