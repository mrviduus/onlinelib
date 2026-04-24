import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Overlayer } from '@textstack/reader-overlay'
import { useOverlayReflow } from './useOverlayReflow'

// Patch ResizeObserver globally; capture the callback so tests can fire it.
class MockResizeObserver {
  static last: MockResizeObserver | null = null
  callback: () => void
  observed: Element[] = []
  constructor(cb: () => void) {
    this.callback = cb
    MockResizeObserver.last = this
  }
  observe(el: Element): void {
    this.observed.push(el)
  }
  disconnect(): void {}
  unobserve(): void {}
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

describe('useOverlayReflow', () => {
  let redraw: ReturnType<typeof vi.fn>
  let syncScroll: ReturnType<typeof vi.fn>
  let overlayer: Overlayer
  let container: HTMLElement
  const originalRO = globalThis.ResizeObserver

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    overlayer = new Overlayer()
    redraw = vi.fn()
    syncScroll = vi.fn()
    overlayer.redraw = redraw as unknown as () => void
    overlayer.syncScroll = syncScroll as unknown as () => void
    MockResizeObserver.last = null
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = originalRO
  })

  it('redraws on ResizeObserver fire (RAF-debounced)', async () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref))
    expect(MockResizeObserver.last).not.toBeNull()
    expect(MockResizeObserver.last!.observed).toContain(container)
    act(() => {
      MockResizeObserver.last!.callback()
      MockResizeObserver.last!.callback()
      MockResizeObserver.last!.callback()
    })
    await flushRaf()
    // Coalesced to a single redraw per animation frame.
    expect(redraw).toHaveBeenCalledTimes(1)
  })

  it('redraws on window resize', async () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref))
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await flushRaf()
    expect(redraw).toHaveBeenCalledTimes(1)
  })

  it('syncs scroll (cheap CSS transform) on window scroll, not full redraw', async () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref))
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    await flushRaf()
    expect(syncScroll).toHaveBeenCalledTimes(1)
    expect(redraw).not.toHaveBeenCalled()
  })

  it('disconnects observers on unmount', () => {
    const ref = { current: container }
    const disconnect = vi.fn()
    class Capture extends MockResizeObserver {
      disconnect(): void {
        disconnect()
      }
    }
    globalThis.ResizeObserver = Capture as unknown as typeof ResizeObserver
    const { unmount } = renderHook(() => useOverlayReflow(overlayer, ref))
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('does nothing when enabled=false', async () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref, { enabled: false }))
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await flushRaf()
    expect(redraw).not.toHaveBeenCalled()
  })

  it('does nothing when overlayer is null', () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(null, ref))
    expect(MockResizeObserver.last).toBeNull()
  })

  it('redraws when an existing img inside the container loads', async () => {
    const img = document.createElement('img')
    container.appendChild(img)
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref))
    act(() => {
      img.dispatchEvent(new Event('load'))
    })
    await flushRaf()
    expect(redraw).toHaveBeenCalledTimes(1)
  })

  it('redraws when a new img is added and later loads', async () => {
    const ref = { current: container }
    renderHook(() => useOverlayReflow(overlayer, ref))
    const img = document.createElement('img')
    container.appendChild(img)
    // Let the MutationObserver microtask run.
    await Promise.resolve()
    await Promise.resolve()
    act(() => {
      img.dispatchEvent(new Event('load'))
    })
    await flushRaf()
    expect(redraw).toHaveBeenCalledTimes(1)
  })
})
