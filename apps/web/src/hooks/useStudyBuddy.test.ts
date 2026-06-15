import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../api/studybuddy', () => ({ runStudyBuddy: vi.fn() }))
import { runStudyBuddy, type StudyBuddyRunCallbacks } from '../api/studybuddy'
import { SseUnauthorizedError } from '../lib/sse'
import { useStudyBuddy } from './useStudyBuddy'

const mockRun = runStudyBuddy as unknown as ReturnType<typeof vi.fn>

const step = (i: number, kind = 'llm_response', payload: unknown = {}) => ({ index: i, kind, payload, at: '' })

/** Drives the mocked runStudyBuddy by firing the given callbacks in order. */
function script(fire: (cb: StudyBuddyRunCallbacks) => void) {
  mockRun.mockImplementationOnce(
    async (_e: string, _p: string, _c: number | null, cb: StudyBuddyRunCallbacks) => fire(cb),
  )
}

describe('useStudyBuddy', () => {
  beforeEach(() => mockRun.mockReset())

  it('accumulates steps and resolves the answer on done', async () => {
    script(cb => {
      cb.onStep(step(0))
      cb.onStep(step(1, 'tool_result', { tool: 'get_chapter', ok: true }))
      cb.onDone({ runId: 'r1', answer: 'A grounded explanation.', iterations: 2, costUsd: 0.004 })
    })
    const { result } = renderHook(() => useStudyBuddy('ed-1'))

    await act(() => result.current.run('A confusing passage.', 3))

    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.steps).toHaveLength(2)
    expect(result.current.answer).toBe('A grounded explanation.')
    expect(result.current.error).toBeNull()
    expect(mockRun).toHaveBeenCalledWith('ed-1', 'A confusing passage.', 3, expect.anything(), expect.anything())
  })

  it('surfaces a terminal error event', async () => {
    script(cb => {
      cb.onStep(step(0))
      cb.onError('Study Buddy service unavailable')
    })
    const { result } = renderHook(() => useStudyBuddy('ed-1'))

    await act(() => result.current.run('passage', null))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('Study Buddy service unavailable')
    expect(result.current.steps).toHaveLength(1) // partial steps kept
  })

  it('maps a 401 to the auth error', async () => {
    mockRun.mockRejectedValueOnce(new SseUnauthorizedError())
    const { result } = renderHook(() => useStudyBuddy('ed-1'))

    await act(() => result.current.run('passage', null))

    await waitFor(() => expect(result.current.error).toBe('auth'))
    expect(result.current.status).toBe('error')
  })

  it('does nothing for an empty passage or missing edition', async () => {
    const { result } = renderHook(() => useStudyBuddy(undefined))
    await act(() => result.current.run('passage', null)) // no edition
    const { result: r2 } = renderHook(() => useStudyBuddy('ed-1'))
    await act(() => r2.current.run('   ', null)) // blank passage

    expect(mockRun).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(r2.current.status).toBe('idle')
  })

  it('reset returns to idle', async () => {
    script(cb => cb.onDone({ runId: 'r', answer: 'x', iterations: 1, costUsd: 0 }))
    const { result } = renderHook(() => useStudyBuddy('ed-1'))
    await act(() => result.current.run('p', null))
    await waitFor(() => expect(result.current.status).toBe('done'))

    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.answer).toBeNull()
  })
})
