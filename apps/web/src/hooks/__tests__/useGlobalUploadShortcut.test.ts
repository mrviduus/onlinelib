import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useGlobalUploadShortcut } from '../useGlobalUploadShortcut'

afterEach(() => cleanup())

function dispatch(key: string, mod: 'meta' | 'ctrl' | 'none' = 'meta') {
  const init: KeyboardEventInit = { key, bubbles: true, cancelable: true }
  if (mod === 'meta') init.metaKey = true
  if (mod === 'ctrl') init.ctrlKey = true
  document.dispatchEvent(new KeyboardEvent('keydown', init))
}

describe('useGlobalUploadShortcut', () => {
  it('triggers callback on Cmd+U when enabled', () => {
    const cb = vi.fn()
    renderHook(() => useGlobalUploadShortcut(true, cb))
    dispatch('u', 'meta')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('triggers callback on Ctrl+U when enabled', () => {
    const cb = vi.fn()
    renderHook(() => useGlobalUploadShortcut(true, cb))
    dispatch('U', 'ctrl')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('does NOT trigger when disabled', () => {
    const cb = vi.fn()
    renderHook(() => useGlobalUploadShortcut(false, cb))
    dispatch('u', 'meta')
    expect(cb).not.toHaveBeenCalled()
  })

  it('does NOT trigger without modifier', () => {
    const cb = vi.fn()
    renderHook(() => useGlobalUploadShortcut(true, cb))
    dispatch('u', 'none')
    expect(cb).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useGlobalUploadShortcut(true, cb))
    unmount()
    dispatch('u', 'meta')
    expect(cb).not.toHaveBeenCalled()
  })
})
