import { describe, it, expect } from 'vitest'
import { citationChapterSlug } from './citation'

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
