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
    expect(resumeChapterSlug(null, null, null)).toBeNull()
  })
})

/**
 * The shelf card and the "Continue Reading" rail hold a progress row and nothing else. They used to
 * read `chapterSlug` straight off it — the field the API derives from `chapterId`, which stops
 * moving the moment infinite scroll carries the reader past the chapter they opened. A reader 45%
 * into act three was sent to the top of act one, and the reader's first automatic save overwrote
 * 45% with 0.66%.
 */
describe('resumeChapterSlug with no chapter list', () => {
  it('still prefers the locator over the stored slug', () => {
    expect(resumeChapterSlug('2-act-i', 'scroll:4-act-iii:7488', null)).toBe('4-act-iii')
    expect(resumeChapterSlug('2-act-i', 'scroll:4-act-iii:7488', [])).toBe('4-act-iii')
  })

  it('falls back to the stored slug when the locator cannot name a chapter', () => {
    // A chapterless PDF's `page:<N>` needs the list to be placed; the stored slug is all there is.
    expect(resumeChapterSlug('ch-1', 'page:5', null)).toBe('ch-1')
    expect(resumeChapterSlug('ch-1', null, null)).toBe('ch-1')
  })

  it('cannot validate, and says so by answering anyway', () => {
    // With no list there is nothing to check a dangling slug against. Answering "no idea" would
    // send the caller back to the first chapter, which is worse than a slug that may be stale.
    expect(resumeChapterSlug(null, 'scroll:ch-renamed:120', null)).toBe('ch-renamed')
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
