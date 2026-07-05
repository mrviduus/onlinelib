import { describe, it, expect } from 'vitest'
import { computeBookProgress, type ChapterWithCount } from './bookProgress'

describe('computeBookProgress — degenerate inputs', () => {
  it('returns null when chapters is empty', () => {
    expect(computeBookProgress([], 'foo', 0.5)).toBeNull()
  })

  it('returns null when currentChapterSlug is null', () => {
    const chapters: ChapterWithCount[] = [{ slug: 'a', wordCount: 100 }]
    expect(computeBookProgress(chapters, null, 0.5)).toBeNull()
  })

  it('returns null when currentChapterSlug is undefined', () => {
    const chapters: ChapterWithCount[] = [{ slug: 'a', wordCount: 100 }]
    expect(computeBookProgress(chapters, undefined, 0.5)).toBeNull()
  })

  it('returns null when slug not found in chapters', () => {
    const chapters: ChapterWithCount[] = [{ slug: 'a', wordCount: 100 }]
    expect(computeBookProgress(chapters, 'nonexistent', 0.5)).toBeNull()
  })

  it('all-zero wordCount falls back to chapter-index path (not null)', () => {
    // wordCount=0 is treated as "no useful weight data" — function falls
    // back to chapter-index path, which IS meaningful (1 chapter, halfway
    // = 50%). null is reserved for "cannot place the user at all".
    const chapters: ChapterWithCount[] = [{ slug: 'a', wordCount: 0 }]
    expect(computeBookProgress(chapters, 'a', 0.5, 0)).toBeCloseTo(0.5)
  })
})

describe('computeBookProgress — word-count weighted', () => {
  const chapters: ChapterWithCount[] = [
    { slug: 'ch1', wordCount: 100 },
    { slug: 'ch2', wordCount: 200 },
    { slug: 'ch3', wordCount: 700 },
  ]
  // total = 1000

  it('first chapter at 0% → 0% of book', () => {
    expect(computeBookProgress(chapters, 'ch1', 0)).toBe(0)
  })

  it('first chapter at 100% → 10% of book (100/1000)', () => {
    expect(computeBookProgress(chapters, 'ch1', 1)).toBeCloseTo(0.1)
  })

  it('first chapter at 50% → 5% of book', () => {
    expect(computeBookProgress(chapters, 'ch1', 0.5)).toBeCloseTo(0.05)
  })

  it('second chapter at 0% → 10% of book (ch1 done)', () => {
    expect(computeBookProgress(chapters, 'ch2', 0)).toBeCloseTo(0.1)
  })

  it('second chapter at 100% → 30% of book (ch1+ch2 done)', () => {
    expect(computeBookProgress(chapters, 'ch2', 1)).toBeCloseTo(0.3)
  })

  it('last chapter at 100% → 100% of book', () => {
    expect(computeBookProgress(chapters, 'ch3', 1)).toBeCloseTo(1)
  })

  it('respects explicit totalWordCount overriding the sum', () => {
    // total=2000 in canonical book metadata, even though our chapters sum to 1000
    // (e.g. some chapters weren't enumerated). ch1 done → 100/2000 = 5%.
    expect(computeBookProgress(chapters, 'ch2', 0, 2000)).toBeCloseTo(0.05)
  })

  it('falls back to sum when totalWordCount is 0/undefined', () => {
    expect(computeBookProgress(chapters, 'ch2', 0, 0)).toBeCloseTo(0.1)
    expect(computeBookProgress(chapters, 'ch2', 0)).toBeCloseTo(0.1)
  })

  it('handles negative chapterProgress by clamping to 0', () => {
    expect(computeBookProgress(chapters, 'ch1', -0.5)).toBe(0)
  })

  it('handles chapterProgress > 1 by clamping to 1', () => {
    expect(computeBookProgress(chapters, 'ch1', 1.5)).toBeCloseTo(0.1)
  })

  it('handles NaN chapterProgress as 0 (WebView divide-by-zero defense)', () => {
    expect(computeBookProgress(chapters, 'ch1', NaN)).toBe(0)
  })

  it('handles Infinity chapterProgress as 0', () => {
    expect(computeBookProgress(chapters, 'ch1', Infinity)).toBe(0)
  })
})

describe('computeBookProgress — missing wordCount (fallback to chapter-index)', () => {
  const chapters: ChapterWithCount[] = [
    { slug: 'ch1' },
    { slug: 'ch2' },
    { slug: 'ch3' },
    { slug: 'ch4' },
  ]

  it('first chapter at 0% → 0% of book', () => {
    expect(computeBookProgress(chapters, 'ch1', 0)).toBe(0)
  })

  it('first chapter at 100% → 25% of book (1/4)', () => {
    expect(computeBookProgress(chapters, 'ch1', 1)).toBeCloseTo(0.25)
  })

  it('second chapter at 50% → 37.5% of book ((1+0.5)/4)', () => {
    expect(computeBookProgress(chapters, 'ch2', 0.5)).toBeCloseTo(0.375)
  })

  it('last chapter at 100% → 100% of book', () => {
    expect(computeBookProgress(chapters, 'ch4', 1)).toBeCloseTo(1)
  })

  it('clamps fallback result to 1 max', () => {
    // Pathological — chapterProgress > 1 on last chapter; expect clamp.
    expect(computeBookProgress(chapters, 'ch4', 2)).toBeCloseTo(1)
  })
})

describe('computeBookProgress — partial wordCount data', () => {
  it('uses weighted path if ANY chapter has wordCount (others treated as 0)', () => {
    const chapters: ChapterWithCount[] = [
      { slug: 'ch1', wordCount: 100 },
      { slug: 'ch2' },                  // null
      { slug: 'ch3', wordCount: 0 },    // explicit 0
    ]
    // total=100; ch2 at 50% → (100 + 0*0.5)/100 = 1.0 (ch1 already done)
    expect(computeBookProgress(chapters, 'ch2', 0.5)).toBeCloseTo(1)
  })

  it('treats null wordCount as 0 contribution', () => {
    const chapters: ChapterWithCount[] = [
      { slug: 'ch1', wordCount: null },
      { slug: 'ch2', wordCount: 500 },
    ]
    // total=500; ch1 at 100% → (0 + 0*1)/500 = 0 (ch1 contributes nothing)
    expect(computeBookProgress(chapters, 'ch1', 1)).toBe(0)
    // ch2 at 50% → (0 + 500*0.5)/500 = 0.5
    expect(computeBookProgress(chapters, 'ch2', 0.5)).toBeCloseTo(0.5)
  })
})

describe('computeBookProgress — single-chapter book', () => {
  it('with wordCount: returns chapterProgress directly', () => {
    const chapters: ChapterWithCount[] = [{ slug: 'only', wordCount: 500 }]
    expect(computeBookProgress(chapters, 'only', 0)).toBe(0)
    expect(computeBookProgress(chapters, 'only', 0.5)).toBeCloseTo(0.5)
    expect(computeBookProgress(chapters, 'only', 1)).toBeCloseTo(1)
  })

  it('without wordCount: returns chapterProgress directly (1/1 chapter)', () => {
    const chapters: ChapterWithCount[] = [{ slug: 'only' }]
    expect(computeBookProgress(chapters, 'only', 0)).toBe(0)
    expect(computeBookProgress(chapters, 'only', 0.5)).toBeCloseTo(0.5)
    expect(computeBookProgress(chapters, 'only', 1)).toBeCloseTo(1)
  })
})

describe('computeBookProgress — web ReaderPage inline-formula parity (R6)', () => {
  // Frozen copy of the ORIGINAL inline `calculatedProgress` from
  // apps/web/src/pages/ReaderPage.tsx (pre-R6-slice2), proving the shared
  // function returns the byte-identical number the web reader used to compute
  // locally. If this drifts, the reader progress bar / resume % would shift.
  function legacyInline(
    chapterList: Array<{ identifier: string; wordCount?: number | null }> | null,
    chapterIdentifier: string | null | undefined,
    overlayScrollProgress: number,
  ): number {
    if (!chapterList) return 0
    const currentId = chapterIdentifier || ''
    if (!currentId) return 0
    const currentChapterIndex = chapterList.findIndex(c => c.identifier === currentId)
    if (currentChapterIndex === -1) return 0

    const totalWords = chapterList.reduce((sum, c) => sum + (c.wordCount || 0), 0)
    if (totalWords === 0) {
      return (currentChapterIndex + overlayScrollProgress) / chapterList.length
    }
    const wordsBeforeCurrent = chapterList
      .slice(0, currentChapterIndex)
      .reduce((sum, c) => sum + (c.wordCount || 0), 0)
    const currentChapterWords = chapterList[currentChapterIndex].wordCount || 0
    const wordsRead = wordsBeforeCurrent + currentChapterWords * overlayScrollProgress
    return wordsRead / totalWords
  }

  // How ReaderPage now feeds the shared fn (overlayScrollProgress already 0..1).
  function viaShared(
    chapterList: Array<{ identifier: string; wordCount?: number | null }> | null,
    chapterIdentifier: string | null | undefined,
    overlayScrollProgress: number,
  ): number {
    const chapters = chapterList?.map(c => ({ slug: c.identifier, wordCount: c.wordCount })) ?? []
    return computeBookProgress(chapters, chapterIdentifier, overlayScrollProgress) ?? 0
  }

  const weighted = [
    { identifier: 'ch1', wordCount: 100 },
    { identifier: 'ch2', wordCount: 200 },
    { identifier: 'ch3', wordCount: 700 },
  ]
  const noWords = [
    { identifier: 'a', wordCount: 0 },
    { identifier: 'b', wordCount: null },
    { identifier: 'c' },
  ]
  const single = [{ identifier: 'only', wordCount: 500 }]

  const cases: Array<[string, typeof weighted | null, string | null | undefined, number]> = [
    ['mid-chapter weighted', weighted, 'ch2', 0.5],
    ['first chapter start', weighted, 'ch1', 0],
    ['last chapter full', weighted, 'ch3', 1],
    ['no-wordCount fallback mid', noWords, 'b', 0.5],
    ['no-wordCount fallback last', noWords, 'c', 1],
    ['single chapter half', single, 'only', 0.5],
    ['null chapterList', null, 'ch1', 0.5],
    ['empty chapterId', weighted, '', 0.5],
    ['unknown chapterId', weighted, 'nope', 0.5],
    ['undefined chapterId', weighted, undefined, 0.5],
  ]

  for (const [name, list, id, prog] of cases) {
    it(`matches legacy inline: ${name}`, () => {
      expect(viaShared(list, id, prog)).toBeCloseTo(legacyInline(list, id, prog), 12)
    })
  }
})

describe('computeBookProgress — monotonicity invariant', () => {
  it('moving forward through chapters never decreases book progress', () => {
    const chapters: ChapterWithCount[] = [
      { slug: 'a', wordCount: 1000 },
      { slug: 'b', wordCount: 2000 },
      { slug: 'c', wordCount: 3000 },
      { slug: 'd', wordCount: 4000 },
    ]
    const steps: number[] = []
    for (const slug of ['a', 'b', 'c', 'd']) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const bp = computeBookProgress(chapters, slug, p)
        if (bp != null) steps.push(bp)
      }
    }
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1])
    }
  })
})

describe('computeBookProgress — infinite-scroll path (visibleChapter ahead of URL)', () => {
  // Mobile reader sets currentChapterSlugRef from the WebView's 'progress'
  // message, which advances as the user scrolls into the appended next
  // chapter. The URL's chapterSlug stays put. computeBookProgress always
  // receives the VISIBLE slug, never the URL one — these tests guard the
  // semantic that "scrolling into the next chapter advances book %".
  const chapters: ChapterWithCount[] = [
    { slug: 'ch1', wordCount: 100 },
    { slug: 'ch2', wordCount: 200 },
    { slug: 'ch3', wordCount: 700 },
  ]

  it('crossing into ch2 from ch1 boundary advances %', () => {
    // End of ch1 → start of ch2 should be CONTINUOUS, not a jump or reset.
    const endOfCh1 = computeBookProgress(chapters, 'ch1', 1) // 0.1
    const startOfCh2 = computeBookProgress(chapters, 'ch2', 0) // 0.1
    expect(endOfCh1).toBeCloseTo(0.1)
    expect(startOfCh2).toBeCloseTo(0.1)
    expect(startOfCh2).toBeGreaterThanOrEqual(endOfCh1!)
  })

  it('infinite-scroll through 3 chapter boundaries stays monotonic', () => {
    // Simulate the WebView reporting steady progress through the document
    // that contains all three chapters appended end-to-end. The slug
    // changes as the user scrolls into each new chapter.
    const trace: Array<{ slug: string; p: number }> = [
      { slug: 'ch1', p: 0 },
      { slug: 'ch1', p: 0.5 },
      { slug: 'ch1', p: 1 },
      { slug: 'ch2', p: 0 },
      { slug: 'ch2', p: 0.5 },
      { slug: 'ch2', p: 1 },
      { slug: 'ch3', p: 0 },
      { slug: 'ch3', p: 0.5 },
      { slug: 'ch3', p: 1 },
    ]
    let prev = -Infinity
    for (const { slug, p } of trace) {
      const bp = computeBookProgress(chapters, slug, p)
      expect(bp).not.toBeNull()
      expect(bp).toBeGreaterThanOrEqual(prev)
      prev = bp!
    }
    expect(prev).toBeCloseTo(1)
  })

  it('regression: chapter-index fallback also stays continuous across boundaries', () => {
    // Same scenario but with NO wordCount data — the fallback path must
    // still be monotonic so infinite-scroll feels smooth even for legacy
    // user-uploads where the extractor never measured chapters.
    const noWc: ChapterWithCount[] = [
      { slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' },
    ]
    const endOfA = computeBookProgress(noWc, 'a', 1) // 0.25
    const startOfB = computeBookProgress(noWc, 'b', 0) // 0.25
    expect(endOfA).toBeCloseTo(0.25)
    expect(startOfB).toBeCloseTo(0.25)
  })
})
