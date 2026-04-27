import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLibrarySort, sortLibraryItems, sortUserBooks } from '../useLibrarySort'
import type { LibraryItem, ReadingProgressDto } from '../../api/auth'
import type { UserBook } from '../../api/userBooks'

const lib = (editionId: string, title: string, createdAt: string): LibraryItem => ({
  editionId, slug: title.toLowerCase(), title, language: 'en', coverPath: null, createdAt,
})

const prog = (editionId: string, percent: number, updatedAt: string): ReadingProgressDto => ({
  editionId, chapterId: 'c1', chapterSlug: 'ch1', locator: '{}', percent, updatedAt,
})

const ub = (id: string, title: string, opts: Partial<UserBook> = {}): UserBook => ({
  id, title, slug: id, description: null, author: null, status: 'Ready', chapterCount: 1,
  createdAt: '2026-04-01T00:00:00Z', completedAt: null, errorMessage: null,
  language: 'en', coverPath: null, genre: null, totalWordCount: null,
  progressPercent: null, progressUpdatedAt: null, progressChapterSlug: null,
  ...opts,
})

describe('useLibrarySort', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to "recent" when nothing stored', () => {
    const { result } = renderHook(() => useLibrarySort('saved'))
    expect(result.current.sort).toBe('recent')
  })

  it('persists per-tab and restores on remount', () => {
    const { result, rerender } = renderHook(({ tab }: { tab: 'saved' | 'uploads' }) => useLibrarySort(tab), {
      initialProps: { tab: 'saved' as 'saved' | 'uploads' },
    })
    act(() => result.current.setSort('title'))
    rerender({ tab: 'uploads' })
    expect(result.current.sort).toBe('recent') // uploads tab — separate
    act(() => result.current.setSort('progress'))
    rerender({ tab: 'saved' })
    expect(result.current.sort).toBe('title') // saved tab kept its choice
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('textstack_library_sort_saved', 'garbage')
    const { result } = renderHook(() => useLibrarySort('saved'))
    expect(result.current.sort).toBe('recent')
  })
})

describe('sortLibraryItems', () => {
  const items = [
    lib('a', 'Banana', '2026-04-01T00:00:00Z'),
    lib('b', 'Apple', '2026-04-10T00:00:00Z'),
    lib('c', 'Cherry', '2026-04-05T00:00:00Z'),
  ]
  const progressMap: Record<string, ReadingProgressDto> = {
    a: prog('a', 0.9, '2026-04-25T00:00:00Z'),
    b: prog('b', 0.1, '2026-04-20T00:00:00Z'),
    c: prog('c', 0.5, '2026-04-26T00:00:00Z'),
  }

  it('title sorts alphabetically', () => {
    expect(sortLibraryItems(items, 'title', {}).map(i => i.title)).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('added sorts by createdAt desc', () => {
    expect(sortLibraryItems(items, 'added', {}).map(i => i.editionId)).toEqual(['b', 'c', 'a'])
  })

  it('progress sorts by percent desc', () => {
    expect(sortLibraryItems(items, 'progress', progressMap).map(i => i.editionId)).toEqual(['a', 'c', 'b'])
  })

  it('recent uses progress.updatedAt when available, else createdAt', () => {
    expect(sortLibraryItems(items, 'recent', progressMap).map(i => i.editionId)).toEqual(['c', 'a', 'b'])
  })

  it('author keeps stable order (LibraryItem has no author field)', () => {
    expect(sortLibraryItems(items, 'author', {}).map(i => i.editionId)).toEqual(['a', 'b', 'c'])
  })
})

describe('sortUserBooks', () => {
  it('pins non-Ready books to top regardless of sort', () => {
    const books: UserBook[] = [
      ub('1', 'Alpha', { status: 'Ready', progressPercent: 0.9 }),
      ub('2', 'Beta', { status: 'Processing' }),
      ub('3', 'Gamma', { status: 'Failed' }),
      ub('4', 'Delta', { status: 'Ready', progressPercent: 0.1 }),
    ]
    const out = sortUserBooks(books, 'title')
    // Processing + Failed first (createdAt-tied, stable here), then Ready by title
    expect(out.slice(0, 2).map(b => b.id).sort()).toEqual(['2', '3'])
    expect(out.slice(2).map(b => b.title)).toEqual(['Alpha', 'Delta'])
  })

  it('author sorts nulls to end', () => {
    const books: UserBook[] = [
      ub('1', 'Z', { author: 'Zelda' }),
      ub('2', 'X', { author: null }),
      ub('3', 'Y', { author: 'Asimov' }),
    ]
    const out = sortUserBooks(books, 'author').map(b => b.id)
    expect(out).toEqual(['3', '1', '2'])
  })

  it('progress sorts by progressPercent desc', () => {
    const books: UserBook[] = [
      ub('1', 'A', { progressPercent: 0.3 }),
      ub('2', 'B', { progressPercent: 0.9 }),
      ub('3', 'C', { progressPercent: null }),
    ]
    expect(sortUserBooks(books, 'progress').map(b => b.id)).toEqual(['2', '1', '3'])
  })

  it('recent uses progressUpdatedAt fallback createdAt', () => {
    const books: UserBook[] = [
      ub('1', 'A', { createdAt: '2026-04-01T00:00:00Z', progressUpdatedAt: '2026-04-26T00:00:00Z' }),
      ub('2', 'B', { createdAt: '2026-04-10T00:00:00Z', progressUpdatedAt: null }),
      ub('3', 'C', { createdAt: '2026-04-05T00:00:00Z', progressUpdatedAt: '2026-04-27T00:00:00Z' }),
    ]
    expect(sortUserBooks(books, 'recent').map(b => b.id)).toEqual(['3', '1', '2'])
  })

  it('added sorts by createdAt desc', () => {
    const books: UserBook[] = [
      ub('1', 'A', { createdAt: '2026-04-01T00:00:00Z' }),
      ub('2', 'B', { createdAt: '2026-04-26T00:00:00Z' }),
      ub('3', 'C', { createdAt: '2026-04-15T00:00:00Z' }),
    ]
    expect(sortUserBooks(books, 'added').map(b => b.id)).toEqual(['2', '3', '1'])
  })
})
