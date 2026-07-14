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

  it('handles a quote with an empty trailing question', () => {
    const content = composeQuotedQuestion('passage', '')
    expect(parseQuotedContent(content)).toEqual({ quote: 'passage', text: '' })
  })
})
