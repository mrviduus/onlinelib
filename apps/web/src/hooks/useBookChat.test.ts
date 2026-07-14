import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../api/bookChat', () => ({
  getBookChat: vi.fn(),
  sendChatMessage: vi.fn(),
  sendChatMessageJson: vi.fn(),
  setSpoilerGate: vi.fn(),
  clearBookChat: vi.fn(),
}))
import {
  getBookChat as getBookChatApi,
  sendChatMessage as sendChatMessageApi,
  sendChatMessageJson as sendChatMessageJsonApi,
  setSpoilerGate as setSpoilerGateApi,
  clearBookChat as clearBookChatApi,
} from '../api/bookChat'
import type { AskTarget } from '../api/ask'
import { SseUnsupportedError } from '../lib/sse'
import { useBookChat } from './useBookChat'

const mockGet = getBookChatApi as unknown as ReturnType<typeof vi.fn>
const mockSend = sendChatMessageApi as unknown as ReturnType<typeof vi.fn>
const mockSendJson = sendChatMessageJsonApi as unknown as ReturnType<typeof vi.fn>
const mockSetSpoiler = setSpoilerGateApi as unknown as ReturnType<typeof vi.fn>
const mockClear = clearBookChatApi as unknown as ReturnType<typeof vi.fn>

const edition: AskTarget = { kind: 'edition', id: 'ed-1' }

const citation = {
  marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 2, charStart: 0, charEnd: 5, preview: 'preview',
}

type Callbacks = {
  onDelta: (s: string) => void
  onDone: (d: { citations: unknown[]; lastReadOrd: number; insufficient: boolean }) => void
  onError: (m: string) => void
  signal?: AbortSignal
}

function streamDeltas(deltas: string[], done: Partial<{ citations: unknown[]; insufficient: boolean }> = {}) {
  mockSend.mockImplementationOnce(
    async (_id: string, _q: string, _c: string | undefined, cb: Callbacks) => {
      for (const d of deltas) cb.onDelta(d)
      cb.onDone({ citations: done.citations ?? [], lastReadOrd: 0, insufficient: Boolean(done.insufficient) })
    },
  )
}

function conversation(messages: unknown[] = [], spoilerGateEnabled = false) {
  return { conversationId: 'conv-1', spoilerGateEnabled, messages }
}

describe('useBookChat', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSend.mockReset()
    mockSendJson.mockReset()
    mockSetSpoiler.mockReset()
    mockClear.mockReset()
  })

  it('loads persisted history and maps messages into turns', async () => {
    mockGet.mockResolvedValueOnce(conversation([
      { ord: 0, role: 'user', content: 'q1' },
      { ord: 1, role: 'assistant', content: 'a1', citations: [citation] },
    ], true))
    const { result } = renderHook(() => useBookChat(edition))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    expect(result.current.history[0]).toMatchObject({ question: 'q1', answer: 'a1', streaming: false })
    expect(result.current.history[0].citations).toHaveLength(1)
    expect(result.current.spoilerGateEnabled).toBe(true)
    expect(result.current.historyLoading).toBe(false)
  })

  it('does not load when disabled', async () => {
    renderHook(() => useBookChat(edition, undefined, false))
    // Give any (unexpected) effect a tick.
    await Promise.resolve()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('optimistically appends a user turn then streams the answer', async () => {
    mockGet.mockResolvedValueOnce(conversation())
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    streamDeltas(['Because ', 'of it.'], { citations: [citation] })
    await act(() => result.current.ask('why?'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0]).toMatchObject({ question: 'why?', answer: 'Because of it.', streaming: false })
    expect(result.current.history[0].citations).toHaveLength(1)
    // No history is sent — the server owns it (send signature: id, question, chapterId, callbacks).
    expect(mockSend.mock.calls[0][0]).toBe('conv-1')
    expect(mockSend.mock.calls[0][1]).toBe('why?')
  })

  it('falls back to JSON when streaming is unsupported', async () => {
    mockGet.mockResolvedValueOnce(conversation())
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    mockSend.mockRejectedValueOnce(new SseUnsupportedError())
    mockSendJson.mockResolvedValueOnce({ answer: 'Plain.', citations: [citation], lastReadOrd: 1, insufficient: false })

    await act(() => result.current.ask('why?'))
    await waitFor(() => expect(result.current.history[0].answer).toBe('Plain.'))
    expect(mockSendJson).toHaveBeenCalledTimes(1)
  })

  it('optimistically toggles the spoiler gate and PATCHes', async () => {
    mockGet.mockResolvedValueOnce(conversation([], false))
    mockSetSpoiler.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    act(() => result.current.setSpoilerGate(true))
    expect(result.current.spoilerGateEnabled).toBe(true) // optimistic, synchronous
    expect(mockSetSpoiler).toHaveBeenCalledWith('conv-1', true)
  })

  it('reverts the spoiler gate if the PATCH fails', async () => {
    mockGet.mockResolvedValueOnce(conversation([], false))
    mockSetSpoiler.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    await act(async () => { result.current.setSpoilerGate(true) })
    await waitFor(() => expect(result.current.spoilerGateEnabled).toBe(false))
  })

  it('clears the chat optimistically', async () => {
    mockGet.mockResolvedValueOnce(conversation([
      { ord: 0, role: 'user', content: 'q1' },
      { ord: 1, role: 'assistant', content: 'a1' },
    ]))
    mockClear.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.history).toHaveLength(1))

    act(() => result.current.clearChat())
    expect(result.current.history).toHaveLength(0)
    expect(mockClear).toHaveBeenCalledWith('conv-1')
  })

  it('surfaces a 401 as auth (sign-in), not an error wall', async () => {
    const { ApiError } = await import('../api/client')
    mockGet.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
    const { result } = renderHook(() => useBookChat(edition))
    await waitFor(() => expect(result.current.error).toBe('auth'))
  })
})
