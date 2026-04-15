import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted mock — vi.mock is elevated above imports, so we use vi.hoisted for the ref.
const { upsertProgressMock } = vi.hoisted(() => ({ upsertProgressMock: vi.fn() }))
vi.mock('../api/auth', () => ({ upsertProgress: upsertProgressMock }))

import { flushLocalProgress } from './progressSync'

describe('flushLocalProgress', () => {
  beforeEach(() => {
    localStorage.clear()
    upsertProgressMock.mockReset()
  })

  it('returns 0 when no reading.progress.* keys present', async () => {
    localStorage.setItem('unrelated.key', 'x')
    expect(await flushLocalProgress()).toBe(0)
    expect(upsertProgressMock).not.toHaveBeenCalled()
  })

  it('flushes all entries, removes localStorage keys, returns count', async () => {
    upsertProgressMock.mockResolvedValue({})
    localStorage.setItem('reading.progress.ed-1', JSON.stringify({
      chapterId: 'c1', locator: 'page:3', percent: 0.1, updatedAt: 1000,
    }))
    localStorage.setItem('reading.progress.ed-2', JSON.stringify({
      chapterId: 'c2', locator: 'percent:0.5', percent: 0.5, updatedAt: 2000,
    }))

    const n = await flushLocalProgress()

    expect(n).toBe(2)
    expect(upsertProgressMock).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('reading.progress.ed-1')).toBeNull()
    expect(localStorage.getItem('reading.progress.ed-2')).toBeNull()
  })

  it('keeps localStorage key on network failure (retry next time)', async () => {
    upsertProgressMock.mockRejectedValue(new Error('500'))
    localStorage.setItem('reading.progress.ed-1', JSON.stringify({
      chapterId: 'c1', locator: 'page:3', percent: 0.1, updatedAt: 1000,
    }))

    const n = await flushLocalProgress()

    expect(n).toBe(0)
    expect(localStorage.getItem('reading.progress.ed-1')).not.toBeNull()
  })

  it('drops corrupt JSON and skips without calling API', async () => {
    localStorage.setItem('reading.progress.ed-bad', 'not-json{{{')

    const n = await flushLocalProgress()

    expect(n).toBe(0)
    expect(upsertProgressMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('reading.progress.ed-bad')).toBeNull()
  })

  it('skips incomplete entries (missing chapterId or locator)', async () => {
    localStorage.setItem('reading.progress.ed-incomplete', JSON.stringify({ percent: 0.3 }))

    const n = await flushLocalProgress()

    expect(n).toBe(0)
    expect(upsertProgressMock).not.toHaveBeenCalled()
    // incomplete is kept — not "corrupt", may become complete later
    expect(localStorage.getItem('reading.progress.ed-incomplete')).not.toBeNull()
  })

  it('sends updatedAt as ISO string to server', async () => {
    upsertProgressMock.mockResolvedValue({})
    localStorage.setItem('reading.progress.ed-1', JSON.stringify({
      chapterId: 'c1', locator: 'page:3', percent: 0.1, updatedAt: 1700000000000,
    }))

    await flushLocalProgress()

    expect(upsertProgressMock).toHaveBeenCalledWith('ed-1', expect.objectContaining({
      updatedAt: new Date(1700000000000).toISOString(),
    }))
  })
})
