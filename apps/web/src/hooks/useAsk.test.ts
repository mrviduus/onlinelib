import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../api/ask', () => ({ ask: vi.fn(), askUserBook: vi.fn() }))
import { ask as askApi, askUserBook as askUserBookApi, type AskTarget } from '../api/ask'
import { useAsk } from './useAsk'

const mockAsk = askApi as unknown as ReturnType<typeof vi.fn>
const mockAskUserBook = askUserBookApi as unknown as ReturnType<typeof vi.fn>

const edition: AskTarget = { kind: 'edition', id: 'ed-1' }
const userbook: AskTarget = { kind: 'userbook', id: 'ub-1' }

const citation = {
  marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 2, charStart: 0, charEnd: 5, preview: 'preview',
}

describe('useAsk', () => {
  beforeEach(() => {
    mockAsk.mockReset()
    mockAskUserBook.mockReset()
  })

  it('appends a turn on success', async () => {
    mockAsk.mockResolvedValueOnce({ answer: 'Because [1].', citations: [citation], lastReadOrd: 3, insufficient: false })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    expect(result.current.history[0]).toMatchObject({ question: 'why?', answer: 'Because [1].' })
    expect(result.current.history[0].citations).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('sets error and keeps history empty on failure', async () => {
    mockAsk.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.history).toHaveLength(0)
  })

  it('flags insufficient turns', async () => {
    mockAsk.mockResolvedValueOnce({ answer: 'Read more first.', citations: [], lastReadOrd: 0, insufficient: true })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    expect(result.current.history[0].insufficient).toBe(true)
  })

  it('forwards currentChapterId to the api when provided', async () => {
    mockAsk.mockResolvedValueOnce({ answer: 'ok', citations: [], lastReadOrd: 0, insufficient: false })
    const { result } = renderHook(() => useAsk(edition, 'chap-guid-4'))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(mockAsk).toHaveBeenCalled())
    expect(mockAsk).toHaveBeenCalledWith('ed-1', 'why?', undefined, expect.anything(), 'chap-guid-4')
  })

  it('routes a userbook target to askUserBook (not the catalog ask)', async () => {
    mockAskUserBook.mockResolvedValueOnce({ answer: 'ok', citations: [], lastReadOrd: 0, insufficient: false })
    const { result } = renderHook(() => useAsk(userbook, 'chap-guid-9'))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(mockAskUserBook).toHaveBeenCalled())
    expect(mockAskUserBook).toHaveBeenCalledWith('ub-1', 'why?', undefined, expect.anything(), 'chap-guid-9')
    expect(mockAsk).not.toHaveBeenCalled()
  })

  it('no-ops without a target', async () => {
    const { result } = renderHook(() => useAsk(undefined))
    await act(() => result.current.ask('why?'))
    expect(mockAsk).not.toHaveBeenCalled()
    expect(mockAskUserBook).not.toHaveBeenCalled()
  })
})
