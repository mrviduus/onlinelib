import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { useContainerMutationObserver } from '../useContainerMutationObserver'

// MutationObserver in JSDOM queues microtasks; RAF in JSDOM is also async.
// Let each assertion poll rather than guess the flush ordering.

describe('useContainerMutationObserver', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  it('fires the callback after childList mutation', async () => {
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    container.appendChild(document.createElement('span'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    expect(onMutate).toHaveBeenCalledTimes(1)
  })

  it('debounces bursts of mutations into a single callback', async () => {
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    for (let i = 0; i < 50; i++) container.appendChild(document.createElement('span'))
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
    expect(onMutate).toHaveBeenCalledTimes(1)
  })

  it('fires on innerHTML replacement (the core bug scenario)', async () => {
    container.innerHTML = '<p>original</p>'
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    container.innerHTML = '<p>replacement</p>'
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('fires on characterData mutation', async () => {
    const text = document.createTextNode('hello')
    container.appendChild(text)
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    text.data = 'changed'
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('does nothing when containerRef is null', async () => {
    const onMutate = vi.fn()
    renderHook(() => {
      const ref: RefObject<HTMLElement | null> = { current: null }
      useContainerMutationObserver(ref, onMutate)
    })

    await new Promise((r) => setTimeout(r, 20))
    expect(onMutate).not.toHaveBeenCalled()
  })

  it('disconnects the observer on unmount', async () => {
    const onMutate = vi.fn()
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    act(() => {
      unmount()
    })

    container.appendChild(document.createElement('span'))
    await new Promise((r) => setTimeout(r, 20))
    expect(onMutate).not.toHaveBeenCalled()
  })

  it('swallows callback errors without tearing down the observer', async () => {
    let calls = 0
    const onMutate = () => {
      calls++
      if (calls === 1) throw new Error('boom')
    }
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    container.appendChild(document.createElement('span'))
    await waitFor(() => expect(calls).toBe(1))

    container.appendChild(document.createElement('span'))
    await waitFor(() => expect(calls).toBe(2))
  })

  it('observes attributes only when opted in', async () => {
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate, { attributes: true })
    })

    container.setAttribute('data-x', 'y')
    await waitFor(() => expect(onMutate).toHaveBeenCalled())
  })

  it('does not fire on attribute change when attributes=false (default)', async () => {
    const onMutate = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useContainerMutationObserver(ref, onMutate)
    })

    container.setAttribute('data-x', 'y')
    await new Promise((r) => setTimeout(r, 20))
    expect(onMutate).not.toHaveBeenCalled()
  })
})
