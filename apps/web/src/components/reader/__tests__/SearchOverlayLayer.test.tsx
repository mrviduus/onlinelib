import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { SearchOverlayLayer } from '../SearchOverlayLayer'

class NoopResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function installRangeStub(rects: { left: number; top: number; width: number; height: number }) {
  const orig = (Range.prototype as unknown as { getClientRects?: () => DOMRectList }).getClientRects
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: function () {
      const r = {
        ...rects,
        right: rects.left + rects.width,
        bottom: rects.top + rects.height,
      } as DOMRect
      return {
        length: 1,
        item: (i: number) => (i === 0 ? r : null),
        [Symbol.iterator]: function* () {
          yield r
        },
      } as unknown as DOMRectList
    },
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function () {
      return {
        ...rects,
        right: rects.left + rects.width,
        bottom: rects.top + rects.height,
      } as DOMRect
    },
  })
  return () => {
    if (orig) {
      Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: orig })
    }
  }
}

function Host({ html, query, active }: { html: string; query: string; active: number }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const ref = { current: el } as React.RefObject<HTMLElement | null>
  return (
    <>
      <div ref={setEl} dangerouslySetInnerHTML={{ __html: html }} />
      <SearchOverlayLayer containerRef={ref} query={query} activeMatchIndex={active} />
    </>
  )
}

describe('SearchOverlayLayer', () => {
  const originalRO = globalThis.ResizeObserver
  let restore: (() => void) | null = null
  let scrollSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver
    restore = installRangeStub({ left: 10, top: 20, width: 40, height: 16 })
    scrollSpy = vi.fn()
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo
  })
  afterEach(() => {
    globalThis.ResizeObserver = originalRO
    restore?.()
    cleanup()
  })

  it('renders nothing (no groups) when query is below min length', () => {
    const { container } = render(<Host html="<p>hello world</p>" query="h" active={0} />)
    expect(container.querySelectorAll('svg[data-reader-overlay="true"] > g').length).toBe(0)
  })

  it('draws one <g> per match', () => {
    const { container } = render(
      <Host html="<p>hello world hello world</p>" query="hello" active={0} />,
    )
    expect(container.querySelectorAll('svg[data-reader-overlay="true"] > g').length).toBe(2)
  })

  it('scrolls active match into view on index change', () => {
    render(<Host html="<p>hello world hello</p>" query="hello" active={1} />)
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('removes all matches when query is cleared', () => {
    const { container, rerender } = render(
      <Host html="<p>hello world</p>" query="hello" active={0} />,
    )
    expect(container.querySelectorAll('svg[data-reader-overlay="true"] > g').length).toBe(1)
    rerender(<Host html="<p>hello world</p>" query="" active={0} />)
    expect(container.querySelectorAll('svg[data-reader-overlay="true"] > g').length).toBe(0)
  })

  it('cleans up SVG on unmount', () => {
    const { container, unmount } = render(
      <Host html="<p>hello</p>" query="hello" active={0} />,
    )
    expect(container.querySelector('svg[data-reader-overlay="true"]')).not.toBeNull()
    unmount()
    expect(container.querySelector('svg[data-reader-overlay="true"]')).toBeNull()
  })
})
