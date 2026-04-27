import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

const useAuthMock = vi.fn()
const getLibraryMock = vi.fn()
const getAllProgressMock = vi.fn()
const getUserBooksMock = vi.fn()

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../api/auth', () => ({
  getLibrary: () => getLibraryMock(),
  getAllProgress: () => getAllProgressMock(),
}))

vi.mock('../../api/userBooks', () => ({
  getUserBooks: () => getUserBooksMock(),
}))

import { useContinueReadingList } from '../useContinueReadingList'

const lib = (editionId: string, slug: string, title: string) => ({
  editionId, slug, title, language: 'en', coverPath: null, createdAt: '',
})
const prog = (editionId: string, percent: number, updatedAt: string) => ({
  editionId, chapterId: 'c1', chapterSlug: 'ch-1', locator: '{}', percent, updatedAt,
})
const ub = (id: string, title: string, percent: number | null, updatedAt: string | null, status = 'Ready') => ({
  id, title, author: 'Tester', status, progressPercent: percent, progressUpdatedAt: updatedAt,
  progressChapterSlug: 'ch-1', coverPath: null,
})

describe('useContinueReadingList', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    getLibraryMock.mockReset()
    getAllProgressMock.mockReset()
    getUserBooksMock.mockReset()
  })
  afterEach(() => cleanup())

  it('returns empty when unauthenticated', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false })
    const { result } = renderHook(() => useContinueReadingList(5))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
    expect(getLibraryMock).not.toHaveBeenCalled()
  })

  it('merges library + userbooks, sorts by updatedAt desc', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getLibraryMock.mockResolvedValue({
      total: 2,
      items: [lib('e1', 'old-book', 'Old'), lib('e2', 'new-book', 'New')],
    })
    getAllProgressMock.mockResolvedValue({
      total: 2,
      items: [prog('e1', 0.2, '2026-04-01T10:00:00Z'), prog('e2', 0.5, '2026-04-25T10:00:00Z')],
    })
    getUserBooksMock.mockResolvedValue([ub('u1', 'My Upload', 0.3, '2026-04-20T10:00:00Z')])

    const { result } = renderHook(() => useContinueReadingList(5))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(3)
    expect(result.current.items[0].kind).toBe('edition')
    expect((result.current.items[0] as any).item.title).toBe('New')
    expect(result.current.items[1].kind).toBe('userbook')
    expect((result.current.items[2] as any).item.title).toBe('Old')
  })

  it('filters out zero, finished and missing progress', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getLibraryMock.mockResolvedValue({
      total: 3,
      items: [lib('e1', 's1', 'Zero'), lib('e2', 's2', 'Done'), lib('e3', 's3', 'Reading')],
    })
    getAllProgressMock.mockResolvedValue({
      total: 3,
      items: [
        prog('e1', 0, '2026-04-01T10:00:00Z'),
        prog('e2', 1, '2026-04-02T10:00:00Z'),
        prog('e3', 0.4, '2026-04-03T10:00:00Z'),
      ],
    })
    getUserBooksMock.mockResolvedValue([
      ub('u1', 'NoProgress', 0, '2026-04-04T10:00:00Z'),
      ub('u2', 'Pending', 0.5, '2026-04-05T10:00:00Z', 'Processing'),
      ub('u3', 'NoTimestamp', 0.5, null),
    ])

    const { result } = renderHook(() => useContinueReadingList(5))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
    expect((result.current.items[0] as any).item.title).toBe('Reading')
  })

  it('respects limit', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getLibraryMock.mockResolvedValue({
      total: 4,
      items: [
        lib('e1', 's1', 'A'), lib('e2', 's2', 'B'),
        lib('e3', 's3', 'C'), lib('e4', 's4', 'D'),
      ],
    })
    getAllProgressMock.mockResolvedValue({
      total: 4,
      items: [
        prog('e1', 0.1, '2026-04-01T10:00:00Z'),
        prog('e2', 0.2, '2026-04-02T10:00:00Z'),
        prog('e3', 0.3, '2026-04-03T10:00:00Z'),
        prog('e4', 0.4, '2026-04-04T10:00:00Z'),
      ],
    })
    getUserBooksMock.mockResolvedValue([])

    const { result } = renderHook(() => useContinueReadingList(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(2)
    expect((result.current.items[0] as any).item.title).toBe('D')
    expect((result.current.items[1] as any).item.title).toBe('C')
  })

  it('returns empty on error without throwing', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getLibraryMock.mockRejectedValue(new Error('fail'))
    getAllProgressMock.mockResolvedValue({ total: 0, items: [] })
    getUserBooksMock.mockResolvedValue([])

    const { result } = renderHook(() => useContinueReadingList(5))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})
