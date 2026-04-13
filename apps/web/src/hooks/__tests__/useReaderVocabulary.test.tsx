import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// --- Mocks ---

const authState: { isAuthenticated: boolean; sessionReadyDelayMs: number } = {
  isAuthenticated: true,
  sessionReadyDelayMs: 0,
}

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    waitForSession: () =>
      authState.sessionReadyDelayMs > 0
        ? new Promise<void>((r) => setTimeout(r, authState.sessionReadyDelayMs))
        : Promise.resolve(),
    // I4: addWord зовёт ensureSession как fallback если !isAuthRef.current после waitForSession.
    // В этих тестах isAuthenticated контролируется флагом authState напрямую,
    // поэтому ensureSession — безопидный no-op resolve.
    ensureSession: () => Promise.resolve(),
  }),
}))

const getReaderVocabMock = vi.fn()
const saveWordMock = vi.fn()

vi.mock('../../api/vocabulary', () => ({
  getReaderVocab: (...args: unknown[]) => getReaderVocabMock(...args),
  saveWord: (...args: unknown[]) => saveWordMock(...args),
  deleteWord: vi.fn(),
  markAsKnown: vi.fn(),
  updateWord: vi.fn(),
}))

vi.mock('../../api/translation', () => ({
  translate: vi.fn().mockResolvedValue({ translatedText: '' }),
}))

// Import under test AFTER mocks are registered.
import { useReaderVocabulary } from '../useReaderVocabulary'

describe('useReaderVocabulary', () => {
  beforeEach(() => {
    authState.isAuthenticated = true
    authState.sessionReadyDelayMs = 0
    getReaderVocabMock.mockReset()
    saveWordMock.mockReset()
    getReaderVocabMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls getReaderVocab on mount when isAuthenticated=true', async () => {
    renderHook(() => useReaderVocabulary('en', 'uk'))
    await waitFor(() => expect(getReaderVocabMock).toHaveBeenCalledTimes(1))
  })

  it('does not call getReaderVocab when !isAuthenticated (no session yet)', async () => {
    authState.isAuthenticated = false
    renderHook(() => useReaderVocabulary('en', 'uk'))
    // Let any microtasks flush.
    await Promise.resolve()
    expect(getReaderVocabMock).not.toHaveBeenCalled()
  })

  it('addWord hits saveWord API when authenticated and dedupes repeats', async () => {
    saveWordMock.mockResolvedValue({
      id: 'w1', word: 'Hello', stage: 0, translation: null,
    })
    const { result } = renderHook(() => useReaderVocabulary('en', 'uk'))
    await waitFor(() => expect(getReaderVocabMock).toHaveBeenCalled())

    await act(async () => {
      await result.current.addWord({ word: 'Hello', language: 'en' })
    })
    expect(saveWordMock).toHaveBeenCalledTimes(1)
    expect(result.current.vocabMap.has('hello')).toBe(true)

    // Second add with identical id + stage should not mutate the map again
    // (same object returned from API — dedupe short-circuit).
    await act(async () => {
      await result.current.addWord({ word: 'Hello', language: 'en' })
    })
    expect(saveWordMock).toHaveBeenCalledTimes(2)
    // Still a single entry for the key — dedup preserved.
    expect(result.current.vocabMap.size).toBe(1)
  })

  it('addWord is a no-op (returns null, skips API) when !isAuthenticated', async () => {
    authState.isAuthenticated = false
    const { result } = renderHook(() => useReaderVocabulary('en', 'uk'))

    let ret: unknown
    await act(async () => {
      ret = await result.current.addWord({ word: 'silent', language: 'en' })
    })

    expect(ret).toBeNull()
    expect(saveWordMock).not.toHaveBeenCalled()
  })

  it('addWord awaits waitForSession before hitting saveWord (B2 gate)', async () => {
    // Start unauthenticated with a session promise that resolves after 50ms.
    // Simulates: user taps word before bootstrap finishes, then session becomes ready and auth flips.
    authState.isAuthenticated = false
    authState.sessionReadyDelayMs = 50
    saveWordMock.mockResolvedValue({
      id: 'w1', word: 'late', stage: 0, translation: null,
    })

    const { result, rerender } = renderHook(() => useReaderVocabulary('en', 'uk'))

    // Fire addWord before "session" resolves.
    let pending: Promise<unknown>
    await act(async () => {
      pending = result.current.addWord({ word: 'late', language: 'en' })
    })
    expect(saveWordMock).not.toHaveBeenCalled()

    // Simulate session becoming ready with auth flipping true.
    authState.isAuthenticated = true
    authState.sessionReadyDelayMs = 0
    rerender()

    await act(async () => {
      await pending
    })

    expect(saveWordMock).toHaveBeenCalledTimes(1)
  })
})
