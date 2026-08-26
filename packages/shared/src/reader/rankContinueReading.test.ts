import { describe, it, expect } from 'vitest'
import {
  rankContinueReading,
  pickContinueReadingBook,
  type LocalProgressLite,
  type UserBookProgressLite,
} from './continueReading'
import type { UserLibraryItem, ReadingProgressDto, UserBookDto } from '../types/api'

// Same fixture shapes as continueReading.test.ts — kept local rather than shared
// so a change there cannot silently reinterpret these cases.

const lib = (o: Partial<UserLibraryItem> = {}): UserLibraryItem => ({
  editionId: 'ed-1',
  slug: 'dracula',
  title: 'Dracula',
  language: 'en',
  coverPath: '/covers/dracula.jpg',
  createdAt: '2026-01-01T00:00:00Z',
  author: 'Bram Stoker',
  ...o,
})

const srvProg = (o: Partial<ReadingProgressDto> = {}): ReadingProgressDto => ({
  editionId: 'ed-1',
  chapterId: 'ch-1',
  chapterSlug: 'chapter-1',
  percent: 0.3,
  updatedAt: '2026-05-01T10:00:00Z',
  ...o,
} as ReadingProgressDto)

const ub = (o: Partial<UserBookDto> = {}): UserBookDto => ({
  id: 'ub-1',
  title: 'Designing Data-Intensive Applications',
  author: 'Kleppmann',
  language: 'en',
  coverPath: null,
  genre: null,
  totalWordCount: 100_000,
  status: 'ready',
  chapterCount: 12,
  createdAt: '2026-04-01T00:00:00Z',
  completedAt: null,
  errorMessage: null,
  progressPercent: 0.25,
  progressUpdatedAt: '2026-05-10T12:00:00Z',
  progressChapterSlug: 'part-3',
  ...o,
})

const emptyLocal = new Map<string, LocalProgressLite>()
const emptyUb = new Map<string, UserBookProgressLite>()

const inputs = (o: Partial<Parameters<typeof rankContinueReading>[0]> = {}) => ({
  library: [],
  serverProgress: [],
  userBooks: [],
  localCatalogMap: emptyLocal,
  localUserBookMap: emptyUb,
  ...o,
})

describe('rankContinueReading', () => {
  it('returns [] when nothing is in progress', () => {
    expect(rankContinueReading(inputs())).toEqual([])
  })

  it('orders most-recently-active first, across both sources', () => {
    // Catalog book touched later than the user book — it must lead.
    const ranked = rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ updatedAt: '2026-05-20T10:00:00Z' })],
      userBooks: [ub({ progressUpdatedAt: '2026-05-10T12:00:00Z' })],
    }))
    expect(ranked.map(p => p.type)).toEqual(['edition', 'userbook'])

    // Flip the timestamps and the order must flip with them.
    const flipped = rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ updatedAt: '2026-05-01T10:00:00Z' })],
      userBooks: [ub({ progressUpdatedAt: '2026-05-30T12:00:00Z' })],
    }))
    expect(flipped.map(p => p.type)).toEqual(['userbook', 'edition'])
  })

  it('keeps input order on an exact timestamp tie — library before user books', () => {
    // Matches the old strictly-greater-than comparison, which left the first
    // encountered winner in place. Array#sort is stable, so this holds.
    const ranked = rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ updatedAt: '2026-05-10T12:00:00Z' })],
      userBooks: [ub({ progressUpdatedAt: '2026-05-10T12:00:00Z' })],
    }))
    expect(ranked.map(p => p.type)).toEqual(['edition', 'userbook'])
  })

  it('excludes finished books from the whole list, not just the head', () => {
    // Book-wide 100% comes from the local cache, which is unambiguous. A bare
    // server 1.0 is a chapter fraction on mobile and stays in the list — see
    // continueReading.test.ts for that case.
    const finished = new Map([
      ['ed-1', { chapterSlug: 'last', percent: 1, bookPercent: 1, updatedAt: Date.parse('2026-06-01T00:00:00Z') }],
    ])
    const ranked = rankContinueReading(inputs({
      library: [lib({ editionId: 'ed-1' }), lib({ editionId: 'ed-2', slug: 'moby-dick' })],
      serverProgress: [
        srvProg({ editionId: 'ed-1', percent: 0.9, updatedAt: '2026-05-30T00:00:00Z' }),
        srvProg({ editionId: 'ed-2', percent: 0.4, updatedAt: '2026-05-01T00:00:00Z' }),
      ],
      localCatalogMap: finished,
    }))
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({ type: 'edition', slug: 'moby-dick' })
  })

  it('keeps the book you are reading when a chapter percent reaches 1.0', () => {
    // The regression this rule exists for: finishing any chapter used to remove
    // the book from both the resume hero and the rail.
    const ranked = rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ percent: 1 })],
    }))
    expect(ranked).toHaveLength(1)
    expect(ranked[0].percent).toBeLessThanOrEqual(1)
  })

  it('excludes user books that are not ready', () => {
    // A book still being parsed has no chapters to resume into.
    expect(rankContinueReading(inputs({
      userBooks: [ub({ status: 'Processing' }), ub({ id: 'ub-2', status: 'Failed' })],
    }))).toEqual([])
  })

  it('carries the chapter slug needed for a real resume link', () => {
    // The whole reason this function exists: /me/library/shelves has no
    // chapterSlug, so a shelf tap cannot resume. These picks can.
    const ranked = rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ chapterSlug: 'chapter-7' })],
      userBooks: [ub({ progressChapterSlug: 'part-3' })],
    }))
    expect(ranked.map(p => p.chapterSlug).sort()).toEqual(['chapter-7', 'part-3'])
  })

  it('drops entries with unusable timestamps rather than ranking them as NaN', () => {
    expect(rankContinueReading(inputs({
      library: [lib()],
      serverProgress: [srvProg({ updatedAt: 'not-a-date' })],
    }))).toEqual([])
  })
})

describe('pickContinueReadingBook is the head of the ranking', () => {
  const cases = [
    inputs(),
    inputs({ library: [lib()], serverProgress: [srvProg()] }),
    inputs({ userBooks: [ub()] }),
    inputs({
      library: [lib()],
      serverProgress: [srvProg({ updatedAt: '2026-05-20T10:00:00Z' })],
      userBooks: [ub()],
    }),
    inputs({ library: [lib()], serverProgress: [srvProg({ percent: 1 })] }),
  ]

  it.each(cases.map((c, i) => [i, c] as const))('case %i agrees', (_i, input) => {
    expect(pickContinueReadingBook(input)).toEqual(rankContinueReading(input)[0] ?? null)
  })
})
