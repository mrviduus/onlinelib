import { describe, it, expect } from 'vitest'
import { chapterIdForSlug, resumeChapterSlug } from './resume'

describe('resumeChapterSlug', () => {
  const chapters = [
    { slug: 'ch-1', sourceStartPage: 1 },
    { slug: 'ch-2', sourceStartPage: 20 },
    { slug: 'ch-3', sourceStartPage: 40 },
  ]

  it('uses the chapter the locator names', () => {
    expect(resumeChapterSlug('ch-2', 'scroll:ch-2:400', chapters)).toBe('ch-2')
  })

  it('believes the locator over a stored chapter that disagrees with it', () => {
    // The data-loss bug, verbatim. `chapterSlug` is derived from the progress row's chapterId,
    // which stops moving once infinite scroll takes over; the locator is written from the chapter
    // on screen. Trusting the slug reopened chapter one and the first automatic save wiped a
    // reader's place.
    expect(resumeChapterSlug('ch-1', 'scroll:ch-2:15718', chapters)).toBe('ch-2')
  })

  it('falls back to the stored chapter when the locator names one that is gone', () => {
    // Re-parsing renames chapters. A locator pointing at a chapter that no longer exists decides
    // nothing, and the stored slug is then the better of two imperfect answers.
    expect(resumeChapterSlug('ch-3', 'scroll:ch-renamed:900', chapters)).toBe('ch-3')
  })

  it('falls back to the page locator when there is no chapter', () => {
    // The catalog screen's defect verbatim: a PDF read to page 24 in Original
    // layout stores chapterSlug null, and looking only at the slug reported the
    // book as never opened.
    expect(resumeChapterSlug(null, 'page:24', chapters)).toBe('ch-2')
  })

  it('ignores a slug that no longer names a chapter', () => {
    // Re-parsing a book can rename chapters. A dangling slug must not win over
    // a page we can still place.
    expect(resumeChapterSlug('ch-deleted', 'page:41', chapters)).toBe('ch-3')
  })

  it('returns null when neither says anything', () => {
    expect(resumeChapterSlug(null, null, chapters)).toBeNull()
    expect(resumeChapterSlug(null, 'page:5', [])).toBeNull()
    expect(resumeChapterSlug('ch-1', 'page:5', null)).toBeNull()
  })
})

describe('chapterIdForSlug', () => {
  const chapters = [
    { id: 'id-1', slug: 'ch-1' },
    { id: 'id-2', slug: 'ch-2' },
  ]

  it('finds the chapter row a visible slug belongs to', () => {
    expect(chapterIdForSlug(chapters, 'ch-2')).toBe('id-2')
  })

  it('returns null for an unknown slug so the caller can keep the id it had', () => {
    // A position saved against a slightly stale chapter is worth more than a position not saved.
    expect(chapterIdForSlug(chapters, 'ch-missing')).toBeNull()
    expect(chapterIdForSlug(chapters, null)).toBeNull()
    expect(chapterIdForSlug(null, 'ch-1')).toBeNull()
  })
})
