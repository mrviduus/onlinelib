import { describe, it, expect } from 'vitest'
import { chapterSlugForPage, resolvePdfResumePage, chapterEndPage, resumeChapterSlug } from './pdfResume'

// A 4-chapter PDF. Chapter three is where the reader left off.
const chapters = [
  { slug: 'intro', sourceStartPage: 1 },
  { slug: 'two', sourceStartPage: 20 },
  { slug: 'three', sourceStartPage: 55 },
  { slug: 'four', sourceStartPage: 90 },
]

describe('chapterSlugForPage', () => {
  it('finds the chapter a page falls inside', () => {
    expect(chapterSlugForPage(chapters, 60)).toBe('three')
    expect(chapterSlugForPage(chapters, 20)).toBe('two')
    expect(chapterSlugForPage(chapters, 89)).toBe('three')
    expect(chapterSlugForPage(chapters, 90)).toBe('four')
  })

  it('returns the first chapter for a page before any later start', () => {
    expect(chapterSlugForPage(chapters, 1)).toBe('intro')
    expect(chapterSlugForPage(chapters, 19)).toBe('intro')
  })

  it('returns the last chapter for a page past every start', () => {
    expect(chapterSlugForPage(chapters, 500)).toBe('four')
  })

  it('returns null when there is nothing to go on', () => {
    expect(chapterSlugForPage([], 10)).toBeNull()
    expect(chapterSlugForPage(chapters, null)).toBeNull()
    expect(chapterSlugForPage(chapters, 0)).toBeNull()
    expect(chapterSlugForPage(chapters, NaN)).toBeNull()
  })

  it('ignores chapters with no measured start page (EPUB, or an older upload)', () => {
    const mixed = [
      { slug: 'a', sourceStartPage: 1 },
      { slug: 'b', sourceStartPage: null },
      { slug: 'c', sourceStartPage: 40 },
    ]
    expect(chapterSlugForPage(mixed, 30)).toBe('a')
    expect(chapterSlugForPage(mixed, 45)).toBe('c')
    expect(chapterSlugForPage([{ slug: 'x', sourceStartPage: null }], 5)).toBeNull()
  })
})

describe('chapterEndPage', () => {
  it('is the next measured start, exclusive', () => {
    expect(chapterEndPage(chapters, 0)).toBe(20)
    expect(chapterEndPage(chapters, 2)).toBe(90)
  })

  it('is null for the last chapter', () => {
    expect(chapterEndPage(chapters, 3)).toBeNull()
  })

  it('skips over unmeasured chapters', () => {
    const mixed = [
      { slug: 'a', sourceStartPage: 1 },
      { slug: 'b', sourceStartPage: null },
      { slug: 'c', sourceStartPage: 40 },
    ]
    expect(chapterEndPage(mixed, 0)).toBe(40)
  })
})

describe('resolvePdfResumePage', () => {
  it('opens the saved page when it lives inside the chapter being opened', () => {
    // Tapping Continue routes to the chapter holding the saved page, so this
    // is the resume case: land exactly where the reader stopped.
    expect(resolvePdfResumePage({ chapterStartPage: 55, chapterEndPage: 90, resumePage: 71 })).toBe(71)
  })

  it('opens the chapter when the saved page is somewhere else', () => {
    // The reader tapped a chapter in the table of contents. They asked for that
    // chapter, not for wherever they were before.
    expect(resolvePdfResumePage({ chapterStartPage: 90, chapterEndPage: null, resumePage: 71 })).toBe(90)
    expect(resolvePdfResumePage({ chapterStartPage: 20, chapterEndPage: 55, resumePage: 71 })).toBe(20)
  })

  it('does not let chapter one page one swallow a saved page deep in the book', () => {
    // The exact regression: every PDF opened at chapter one, whose start page is
    // 1, and the chapter-beats-resume rule discarded page 87 every time.
    expect(resolvePdfResumePage({ chapterStartPage: 1, chapterEndPage: 20, resumePage: 87 })).toBe(1)
    // ...but when Continue correctly routes into the chapter holding page 87:
    expect(resolvePdfResumePage({ chapterStartPage: 55, chapterEndPage: 90, resumePage: 87 })).toBe(87)
  })

  it('treats the last chapter as open-ended', () => {
    expect(resolvePdfResumePage({ chapterStartPage: 90, chapterEndPage: null, resumePage: 140 })).toBe(140)
  })

  it('falls back to the saved page when the chapter has no measured start', () => {
    expect(resolvePdfResumePage({ chapterStartPage: null, resumePage: 33 })).toBe(33)
  })

  it('falls back to page one when it knows nothing', () => {
    expect(resolvePdfResumePage({})).toBe(1)
    expect(resolvePdfResumePage({ chapterStartPage: null, resumePage: null })).toBe(1)
    expect(resolvePdfResumePage({ chapterStartPage: NaN, resumePage: NaN })).toBe(1)
  })

  it('never returns a page below one', () => {
    expect(resolvePdfResumePage({ chapterStartPage: -5, resumePage: -9 })).toBe(1)
    expect(resolvePdfResumePage({ chapterStartPage: 0, resumePage: 0 })).toBe(1)
  })

  it('floors fractional input rather than handing a float to the viewer', () => {
    expect(resolvePdfResumePage({ chapterStartPage: 55, chapterEndPage: 90, resumePage: 71.8 })).toBe(71)
  })
})

describe('resumeChapterSlug', () => {
  const chapters = [
    { slug: 'ch-1', sourceStartPage: 1 },
    { slug: 'ch-2', sourceStartPage: 20 },
    { slug: 'ch-3', sourceStartPage: 40 },
  ]

  it('prefers a stored chapter slug that still exists', () => {
    expect(resumeChapterSlug('ch-2', 'scroll:ch-2:400', chapters)).toBe('ch-2')
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
