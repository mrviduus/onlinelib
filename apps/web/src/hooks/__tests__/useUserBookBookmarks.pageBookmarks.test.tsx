import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock the userBooks api module — the hook is driven purely through it.
const getUserBookBookmarks = vi.fn()
const createUserBookBookmark = vi.fn()
const deleteUserBookBookmark = vi.fn()
vi.mock('../../api/userBooks', () => ({
  getUserBookBookmarks: (...a: unknown[]) => getUserBookBookmarks(...a),
  createUserBookBookmark: (...a: unknown[]) => createUserBookBookmark(...a),
  deleteUserBookBookmark: (...a: unknown[]) => deleteUserBookBookmark(...a),
}))

import { useUserBookBookmarks } from '../useUserBookBookmarks'

beforeEach(() => {
  vi.clearAllMocks()
  getUserBookBookmarks.mockResolvedValue([])
})

describe('useUserBookBookmarks — Original-layout page bookmarks (ADR-012)', () => {
  it('addPageBookmark POSTs chapterId:null + page:<N> locator and tracks it', async () => {
    createUserBookBookmark.mockResolvedValue({
      id: 'bm1',
      chapterId: null,
      chapterSlug: null,
      locator: 'page:7',
      title: 'Page 7',
      createdAt: new Date().toISOString(),
    })

    const { result } = renderHook(() => useUserBookBookmarks('book-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addPageBookmark(7)
    })

    expect(createUserBookBookmark).toHaveBeenCalledWith('book-1', {
      chapterId: null,
      locator: 'page:7',
      title: 'Page 7',
    })
    expect(result.current.isPageBookmarked(7)).toBe(true)
    expect(result.current.getPageBookmark(7)?.page).toBe(7)
    expect(result.current.isPageBookmarked(8)).toBe(false)
  })

  it('addPageBookmark is idempotent — a second call for the same page does not re-POST', async () => {
    createUserBookBookmark.mockResolvedValue({
      id: 'bm1',
      chapterId: null,
      chapterSlug: null,
      locator: 'page:3',
      title: 'Page 3',
      createdAt: new Date().toISOString(),
    })

    const { result } = renderHook(() => useUserBookBookmarks('book-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addPageBookmark(3) })
    await act(async () => { await result.current.addPageBookmark(3) })

    expect(createUserBookBookmark).toHaveBeenCalledTimes(1)
    expect(result.current.bookmarks).toHaveLength(1)
  })

  it('parses page from a server-loaded page:<N> bookmark', async () => {
    getUserBookBookmarks.mockResolvedValue([
      { id: 'bm9', chapterId: null, chapterSlug: null, locator: 'page:12', title: 'Page 12', createdAt: new Date().toISOString() },
    ])

    const { result } = renderHook(() => useUserBookBookmarks('book-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isPageBookmarked(12)).toBe(true)
    expect(result.current.getPageBookmark(12)?.id).toBe('bm9')
  })

  it('removeBookmark deletes a page bookmark server-side and locally', async () => {
    getUserBookBookmarks.mockResolvedValue([
      { id: 'bm9', chapterId: null, chapterSlug: null, locator: 'page:5', title: 'Page 5', createdAt: new Date().toISOString() },
    ])
    deleteUserBookBookmark.mockResolvedValue(undefined)

    const { result } = renderHook(() => useUserBookBookmarks('book-1'))
    await waitFor(() => expect(result.current.isPageBookmarked(5)).toBe(true))

    await act(async () => { await result.current.removeBookmark('bm9') })

    expect(deleteUserBookBookmark).toHaveBeenCalledWith('book-1', 'bm9')
    expect(result.current.isPageBookmarked(5)).toBe(false)
  })
})
