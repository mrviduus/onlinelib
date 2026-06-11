import { describe, it, expect } from 'vitest'
import { citationChapterSlug, makeSnippet } from './citation'

const chapters = [
  { chapterNumber: 1, slug: 'intro' },
  { chapterNumber: 2, slug: 'replication' },
  { slug: 'no-number' },
]

describe('citationChapterSlug', () => {
  it('resolves the slug for a matching chapter ordinal', () => {
    expect(citationChapterSlug(chapters, 2)).toBe('replication')
  })

  it('returns undefined when no chapter matches', () => {
    expect(citationChapterSlug(chapters, 99)).toBeUndefined()
    expect(citationChapterSlug([], 1)).toBeUndefined()
  })
})

describe('makeSnippet', () => {
  it('returns the whole string when short enough (and collapses whitespace)', () => {
    expect(makeSnippet('  the   quick brown  ')).toBe('the quick brown')
  })

  it('cuts a long preview at a word boundary', () => {
    const long = 'Replication keeps a copy of the same data on multiple machines for fault tolerance'
    const s = makeSnippet(long)
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s).not.toMatch(/\s$/)
    expect(long).toContain(s)
  })

  it('returns empty for too-short input', () => {
    expect(makeSnippet('short')).toBe('')
    expect(makeSnippet('   ')).toBe('')
  })
})
