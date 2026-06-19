import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/ask', () => ({
  getIndexStatus: vi.fn(),
  prepareIndex: vi.fn(),
  getUserIndexStatus: vi.fn(),
  prepareUserIndex: vi.fn(),
}))
import {
  getIndexStatus,
  prepareIndex,
  getUserIndexStatus,
  prepareUserIndex,
  type AskTarget,
} from '../api/ask'
import { useRagIndex } from './useRagIndex'

const mockGet = getIndexStatus as unknown as ReturnType<typeof vi.fn>
const mockPrepare = prepareIndex as unknown as ReturnType<typeof vi.fn>
const mockGetUser = getUserIndexStatus as unknown as ReturnType<typeof vi.fn>
const mockPrepareUser = prepareUserIndex as unknown as ReturnType<typeof vi.fn>

const edition = (over: Partial<AskTarget> = {}): AskTarget => ({ kind: 'edition', id: 'ed-1', ...over })
const userbook = (over: Partial<AskTarget> = {}): AskTarget => ({ kind: 'userbook', id: 'ub-1', ...over })

describe('useRagIndex', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPrepare.mockReset()
    mockGetUser.mockReset()
    mockPrepareUser.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('seeds from initial status without fetching', () => {
    const { result } = renderHook(() => useRagIndex(edition({ ragStatus: 'Ready', ragChunkCount: 10, ragEmbeddedCount: 10 })))
    expect(result.current.status).toBe('Ready')
    expect(result.current.chunkCount).toBe(10)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('defaults to NotIndexed when unseeded', () => {
    const { result } = renderHook(() => useRagIndex(edition()))
    expect(result.current.status).toBe('NotIndexed')
  })

  it('NotIndexed → prepare → Indexing → poll → Ready', async () => {
    mockPrepare.mockResolvedValueOnce({ status: 'Indexing', chunkCount: 4, embeddedCount: 0 })
    mockGet
      .mockResolvedValueOnce({ status: 'Indexing', chunkCount: 4, embeddedCount: 2 })
      .mockResolvedValueOnce({ status: 'Ready', chunkCount: 4, embeddedCount: 4 })

    const { result } = renderHook(() => useRagIndex(edition({ ragStatus: 'NotIndexed' })))

    await act(async () => {
      result.current.prepare()
    })
    expect(result.current.status).toBe('Indexing')
    expect(result.current.chunkCount).toBe(4)

    // First poll tick → still Indexing, embedded advances.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(result.current.status).toBe('Indexing')
    expect(result.current.embeddedCount).toBe(2)

    // Second poll tick → Ready, polling stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(result.current.status).toBe('Ready')
    expect(result.current.embeddedCount).toBe(4)

    // No further polls after Ready.
    const callsAfterReady = mockGet.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(mockGet.mock.calls.length).toBe(callsAfterReady)
  })

  it('prepare returning Ready immediately does not poll', async () => {
    mockPrepare.mockResolvedValueOnce({ status: 'Ready', chunkCount: 8, embeddedCount: 8 })
    const { result } = renderHook(() => useRagIndex(edition({ ragStatus: 'NotIndexed' })))

    await act(async () => {
      result.current.prepare()
    })
    expect(result.current.status).toBe('Ready')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('sets Failed when prepare throws', async () => {
    mockPrepare.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useRagIndex(edition({ ragStatus: 'NotIndexed' })))

    await act(async () => {
      await result.current.prepare()
    })
    expect(result.current.status).toBe('Failed')
    expect(result.current.preparing).toBe(false)
  })

  it('polls when seeded already Indexing', async () => {
    mockGet.mockResolvedValueOnce({ status: 'Ready', chunkCount: 3, embeddedCount: 3 })
    const { result } = renderHook(() => useRagIndex(edition({ ragStatus: 'Indexing', ragChunkCount: 3, ragEmbeddedCount: 1 })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(result.current.status).toBe('Ready')
  })

  it('stops polling after unmount (no further getIndexStatus calls)', async () => {
    mockGet.mockResolvedValue({ status: 'Indexing', chunkCount: 4, embeddedCount: 1 })
    const { unmount } = renderHook(() => useRagIndex(edition({ ragStatus: 'Indexing', ragChunkCount: 4, ragEmbeddedCount: 1 })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    const callsBeforeUnmount = mockGet.mock.calls.length
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(mockGet.mock.calls.length).toBe(callsBeforeUnmount)
  })

  it('does not throw on a poll that resolves after unmount', async () => {
    // Poll request is in flight when the component unmounts; its setState must be guarded.
    let resolvePoll: (v: unknown) => void = () => {}
    mockGet.mockImplementationOnce(
      () => new Promise(res => { resolvePoll = res }),
    )
    const { unmount } = renderHook(() => useRagIndex(edition({ ragStatus: 'Indexing', ragChunkCount: 4, ragEmbeddedCount: 1 })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000) // fires poll → pending promise
    })
    unmount()
    await act(async () => {
      resolvePoll({ status: 'Ready', chunkCount: 4, embeddedCount: 4 })
      await Promise.resolve()
    })
    // No assertion error / unhandled rejection = pass; the guard skips setState post-unmount.
    expect(true).toBe(true)
  })

  // --- AI-027 P2: user-uploaded books route to the /me/books/{id}/... endpoints. ---

  it('userbook target hits the /me/books prepare + poll endpoints (not the catalog ones)', async () => {
    mockPrepareUser.mockResolvedValueOnce({ status: 'Indexing', chunkCount: 5, embeddedCount: 0 })
    mockGetUser.mockResolvedValueOnce({ status: 'Ready', chunkCount: 5, embeddedCount: 5 })

    const { result } = renderHook(() => useRagIndex(userbook({ ragStatus: 'NotIndexed' })))

    await act(async () => {
      result.current.prepare()
    })
    expect(mockPrepareUser).toHaveBeenCalledWith('ub-1', expect.anything())
    expect(mockPrepare).not.toHaveBeenCalled()
    expect(result.current.status).toBe('Indexing')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockGetUser).toHaveBeenCalledWith('ub-1')
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.status).toBe('Ready')
  })

  it('userbook seeded already Indexing polls the user endpoint', async () => {
    mockGetUser.mockResolvedValueOnce({ status: 'Ready', chunkCount: 2, embeddedCount: 2 })
    const { result } = renderHook(() => useRagIndex(userbook({ ragStatus: 'Indexing', ragChunkCount: 2, ragEmbeddedCount: 1 })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockGetUser).toHaveBeenCalledWith('ub-1')
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.status).toBe('Ready')
  })
})
