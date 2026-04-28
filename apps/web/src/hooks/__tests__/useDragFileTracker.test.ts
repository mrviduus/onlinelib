import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useDragFileTracker } from '../useDragFileTracker'

afterEach(() => cleanup())

interface FakeDataTransfer {
  types: string[]
  files: File[]
}

function dispatch(type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', dt: FakeDataTransfer | null) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer?: FakeDataTransfer | null }
  Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true })
  document.dispatchEvent(ev)
}

const filesDt = (files: File[] = []): FakeDataTransfer => ({ types: ['Files'], files })
const textDt = (): FakeDataTransfer => ({ types: ['text/plain'], files: [] })

describe('useDragFileTracker', () => {
  it('does nothing when disabled', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useDragFileTracker({ enabled: false, onDrop }))
    act(() => dispatch('dragenter', filesDt()))
    expect(result.current.isDragging).toBe(false)
  })

  it('sets isDragging true on first dragenter with Files', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    act(() => dispatch('dragenter', filesDt()))
    expect(result.current.isDragging).toBe(true)
  })

  it('ignores text drags', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    act(() => dispatch('dragenter', textDt()))
    expect(result.current.isDragging).toBe(false)
  })

  it('handles nested dragenter/leave with depth counter', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    act(() => dispatch('dragenter', filesDt()))
    act(() => dispatch('dragenter', filesDt()))
    expect(result.current.isDragging).toBe(true)
    act(() => dispatch('dragleave', filesDt()))
    expect(result.current.isDragging).toBe(true)
    act(() => dispatch('dragleave', filesDt()))
    expect(result.current.isDragging).toBe(false)
  })

  it('fires onDrop with files and resets isDragging', () => {
    const onDrop = vi.fn()
    const f = new File(['x'], 'book.epub')
    const { result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    act(() => dispatch('dragenter', filesDt()))
    act(() => dispatch('drop', filesDt([f])))
    expect(onDrop).toHaveBeenCalledWith([f])
    expect(result.current.isDragging).toBe(false)
  })

  it('drop with no files does not call onDrop', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    act(() => dispatch('dragenter', filesDt()))
    act(() => dispatch('drop', filesDt([])))
    expect(onDrop).not.toHaveBeenCalled()
    expect(result.current.isDragging).toBe(false)
  })

  it('cleans up listeners on unmount', () => {
    const onDrop = vi.fn()
    const { unmount, result } = renderHook(() => useDragFileTracker({ enabled: true, onDrop }))
    unmount()
    const probe = renderHook(() => useDragFileTracker({ enabled: true, onDrop: vi.fn() }))
    act(() => dispatch('dragenter', filesDt()))
    expect(result.current.isDragging).toBe(false)
    expect(probe.result.current.isDragging).toBe(true)
  })
})
