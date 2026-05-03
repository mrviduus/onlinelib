import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReaderScrollSync } from '../useReaderScrollSync'

// rAF runs sync in tests so window.scrollTo fires within renderHook.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const noopProgress = {
  updateProgress: vi.fn(),
  flushSave: vi.fn(),
}
const noopUserProgress = {
  saveProgress: vi.fn(),
  flushSave: vi.fn(),
}

const baseProps = {
  mode: 'public' as const,
  chapterIdentifier: 'ch1',
  chapterLoaded: true,
  overallProgress: 0,
  effectiveProgress: null,
  effectiveLoading: false,
  publicBookChapters: [{ id: 'ch1-id', slug: 'ch1' }] as any,
  publicProgress: noopProgress,
  userProgress: noopUserProgress,
}

describe('useReaderScrollSync — scroll restore', () => {
  it('scrolls to top when no saved progress', () => {
    renderHook(() => useReaderScrollSync(baseProps))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('scrolls to top when locator does not start with scroll:', () => {
    renderHook(() =>
      useReaderScrollSync({ ...baseProps, effectiveProgress: { locator: 'percent:0.5' } }),
    )
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('scrolls to top when locator chapter slug does not match current chapter', () => {
    renderHook(() =>
      useReaderScrollSync({
        ...baseProps,
        chapterIdentifier: 'ch2',
        effectiveProgress: { locator: 'scroll:ch1:5000' },
      }),
    )
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('scrolls to top when locator is malformed (parts < 3)', () => {
    renderHook(() =>
      useReaderScrollSync({ ...baseProps, effectiveProgress: { locator: 'scroll:ch1' } }),
    )
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('scrolls to top when offset is NaN', () => {
    renderHook(() =>
      useReaderScrollSync({ ...baseProps, effectiveProgress: { locator: 'scroll:ch1:abc' } }),
    )
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('restores to saved offset when locator chapter matches', () => {
    renderHook(() =>
      useReaderScrollSync({
        ...baseProps,
        effectiveProgress: { locator: 'scroll:ch1:5000' },
      }),
    )
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 5000, behavior: 'instant' })
  })

  it('does not restore while effectiveLoading', () => {
    renderHook(() =>
      useReaderScrollSync({
        ...baseProps,
        effectiveLoading: true,
        effectiveProgress: { locator: 'scroll:ch1:5000' },
      }),
    )
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('does not restore while chapter not loaded', () => {
    renderHook(() =>
      useReaderScrollSync({
        ...baseProps,
        chapterLoaded: false,
        effectiveProgress: { locator: 'scroll:ch1:5000' },
      }),
    )
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('on chapter change with stale locator (savedSlug=ch1, new=ch2) → scrolls to top', () => {
    // Simulates the bug PR #193 fixed: user clicks Next at the bottom of ch1,
    // chapterIdentifier flips to ch2, locator still points at ch1.
    const { rerender } = renderHook((props: typeof baseProps) => useReaderScrollSync(props), {
      initialProps: { ...baseProps, effectiveProgress: { locator: 'scroll:ch1:8000' } },
    })
    // First render restored to saved offset.
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 8000, behavior: 'instant' })
    ;(window.scrollTo as any).mockClear()

    rerender({
      ...baseProps,
      chapterIdentifier: 'ch2',
      effectiveProgress: { locator: 'scroll:ch1:8000' },
    })
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })
})
