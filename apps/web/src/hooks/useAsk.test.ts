import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../api/ask', () => ({
  ask: vi.fn(),
  askUserBook: vi.fn(),
  askStream: vi.fn(),
  MAX_HISTORY_TURNS: 6,
}))
import {
  ask as askJsonApi,
  askUserBook as askUserBookJsonApi,
  askStream as askStreamApi,
  type AskTarget,
} from '../api/ask'
import { SseUnsupportedError } from '../lib/sse'
import { useAsk } from './useAsk'

const mockAskStream = askStreamApi as unknown as ReturnType<typeof vi.fn>
const mockAskJson = askJsonApi as unknown as ReturnType<typeof vi.fn>
const mockAskUserBookJson = askUserBookJsonApi as unknown as ReturnType<typeof vi.fn>

const edition: AskTarget = { kind: 'edition', id: 'ed-1' }
const userbook: AskTarget = { kind: 'userbook', id: 'ub-1' }

const citation = {
  marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 2, charStart: 0, charEnd: 5, preview: 'preview',
}

type Callbacks = {
  onDelta: (s: string) => void
  onDone: (d: { citations: unknown[]; lastReadOrd: number; insufficient: boolean }) => void
  onError: (m: string) => void
  signal?: AbortSignal
}

/** Drives askStream: emit deltas then a done payload. */
function streamDeltas(deltas: string[], done: Partial<{ citations: unknown[]; insufficient: boolean }> = {}) {
  mockAskStream.mockImplementationOnce(
    async (_t: AskTarget, _q: string, _h: unknown, cb: Callbacks) => {
      for (const d of deltas) cb.onDelta(d)
      cb.onDone({ citations: done.citations ?? [], lastReadOrd: 0, insufficient: Boolean(done.insufficient) })
    },
  )
}

describe('useAsk (streaming)', () => {
  beforeEach(() => {
    mockAskStream.mockReset()
    mockAskJson.mockReset()
    mockAskUserBookJson.mockReset()
  })

  it('accumulates deltas into the turn answer, then done sets citations', async () => {
    streamDeltas(['Because ', 'of [1].'], { citations: [citation] })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]).toMatchObject({ question: 'why?', answer: 'Because of [1].', streaming: false })
    expect(result.current.history[0].citations).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('flags insufficient turns from the done payload', async () => {
    streamDeltas(['Read more first.'], { insufficient: true })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    expect(result.current.history[0].insufficient).toBe(true)
  })

  it('sends bounded last-6-turn history on the next question', async () => {
    // Seed 7 prior answered turns via repeated streamed asks.
    const { result } = renderHook(() => useAsk(edition))
    for (let i = 0; i < 7; i++) {
      streamDeltas([`answer-${i}`])
      await act(() => result.current.ask(`q-${i}`))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
    }

    // The 8th question should carry only the last 6 turns (12 user/assistant messages).
    streamDeltas(['final'])
    await act(() => result.current.ask('q-final'))
    await waitFor(() => expect(mockAskStream).toHaveBeenCalledTimes(8))

    const lastCall = mockAskStream.mock.calls[7]
    const sentHistory = lastCall[2] as { role: string; content: string }[]
    // Hook bounds to last 6 *turns* (slice(-6)); each turn = 2 messages → 12 messages.
    expect(sentHistory.length).toBeLessThanOrEqual(12)
    // Earliest sent message must not be q-0 (it was dropped by the bound).
    expect(sentHistory[0].content).not.toBe('q-0')
  })

  it('routes a userbook target to the userbook ask url', async () => {
    streamDeltas(['ok'])
    const { result } = renderHook(() => useAsk(userbook, 'chap-guid-9'))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(mockAskStream).toHaveBeenCalled())
    expect(mockAskStream.mock.calls[0][0]).toEqual(userbook)
    expect(mockAskStream.mock.calls[0][4]).toBe('chap-guid-9')
  })

  it('surfaces a stream error event and clears streaming flag', async () => {
    mockAskStream.mockImplementationOnce(async (_t, _q, _h, cb: Callbacks) => {
      cb.onDelta('Partial ')
      cb.onError('Ask service unavailable')
    })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.error).toBe('Ask service unavailable'))
    expect(result.current.history[0].answer).toBe('Partial ')
    expect(result.current.history[0].streaming).toBe(false)
  })

  it('falls back to the JSON request when streaming is unsupported', async () => {
    mockAskStream.mockRejectedValueOnce(new SseUnsupportedError())
    mockAskJson.mockResolvedValueOnce({ answer: 'Plain answer.', citations: [citation], lastReadOrd: 1, insufficient: false })
    const { result } = renderHook(() => useAsk(edition))

    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.history[0].answer).toBe('Plain answer.'))
    expect(mockAskJson).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('aborts the in-flight stream on unmount', async () => {
    let captured: AbortSignal | undefined
    mockAskStream.mockImplementationOnce(
      (_t, _q, _h, cb: Callbacks) => {
        captured = cb.signal
        return new Promise(() => {}) // never resolves
      },
    )
    const { result, unmount } = renderHook(() => useAsk(edition))

    act(() => { void result.current.ask('why?') })
    await waitFor(() => expect(captured).toBeDefined())
    expect(captured!.aborted).toBe(false)

    unmount()
    expect(captured!.aborted).toBe(true)
  })

  it('no-ops without a target', async () => {
    const { result } = renderHook(() => useAsk(undefined))
    await act(() => result.current.ask('why?'))
    expect(mockAskStream).not.toHaveBeenCalled()
  })
})
