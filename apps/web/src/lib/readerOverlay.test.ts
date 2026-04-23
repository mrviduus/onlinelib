import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Overlayer } from './readerOverlay'

// JSDOM doesn't implement Range.getClientRects — assign a stub per range.
function stubRects(range: Range, rects: Partial<DOMRect>[]): void {
  const fakes = rects.map((r) => ({
    x: r.x ?? r.left ?? 0,
    y: r.y ?? r.top ?? 0,
    left: r.left ?? 0,
    top: r.top ?? 0,
    right: r.right ?? (r.left ?? 0) + (r.width ?? 0),
    bottom: r.bottom ?? (r.top ?? 0) + (r.height ?? 0),
    width: r.width ?? 0,
    height: r.height ?? 0,
    toJSON: () => ({}),
  })) as DOMRect[]
  const list = {
    length: fakes.length,
    item: (i: number) => fakes[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const r of fakes) yield r
    },
  } as unknown as DOMRectList
  Object.defineProperty(range, 'getClientRects', {
    configurable: true,
    value: () => list,
  })
}

function mkRange(): Range {
  const container = document.createElement('p')
  container.textContent = 'hello world'
  document.body.appendChild(container)
  const range = document.createRange()
  range.selectNodeContents(container)
  return range
}

describe('Overlayer', () => {
  let ov: Overlayer

  beforeEach(() => {
    ov = new Overlayer()
    document.body.appendChild(ov.element)
  })

  it('exposes a namespaced SVG root with pointer-events disabled', () => {
    expect(ov.element.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(ov.element.style.pointerEvents).toBe('none')
    expect(ov.element.getAttribute('data-reader-overlay')).toBe('true')
  })

  it('add inserts an element and tracks the key', () => {
    const range = mkRange()
    stubRects(range, [{ left: 10, top: 10, width: 50, height: 20 }])
    ov.add('k1', range, Overlayer.highlight)
    expect(ov.has('k1')).toBe(true)
    expect(ov.size).toBe(1)
    expect(ov.element.children).toHaveLength(1)
  })

  it('add replaces an existing key (no duplicate elements)', () => {
    const a = mkRange()
    const b = mkRange()
    stubRects(a, [{ left: 0, top: 0, width: 10, height: 10 }])
    stubRects(b, [{ left: 5, top: 5, width: 10, height: 10 }])
    ov.add('k1', a, Overlayer.highlight)
    ov.add('k1', b, Overlayer.underline)
    expect(ov.size).toBe(1)
    expect(ov.element.children).toHaveLength(1)
  })

  it('remove drops the key and element', () => {
    const range = mkRange()
    stubRects(range, [{ left: 0, top: 0, width: 10, height: 10 }])
    ov.add('k1', range, Overlayer.highlight)
    ov.remove('k1')
    expect(ov.has('k1')).toBe(false)
    expect(ov.size).toBe(0)
    expect(ov.element.children).toHaveLength(0)
  })

  it('remove is a noop for unknown keys', () => {
    expect(() => ov.remove('ghost')).not.toThrow()
  })

  it('clear drops everything', () => {
    const r1 = mkRange()
    const r2 = mkRange()
    stubRects(r1, [{ left: 0, top: 0, width: 10, height: 10 }])
    stubRects(r2, [{ left: 0, top: 0, width: 10, height: 10 }])
    ov.add('a', r1, Overlayer.highlight)
    ov.add('b', r2, Overlayer.underline)
    ov.clear()
    expect(ov.size).toBe(0)
    expect(ov.element.children).toHaveLength(0)
  })

  it('redraw re-invokes the draw fn with fresh rects', () => {
    const range = mkRange()
    stubRects(range, [{ left: 0, top: 0, width: 10, height: 10 }])
    const draw = vi.fn(Overlayer.highlight)
    ov.add('k', range, draw)
    expect(draw).toHaveBeenCalledTimes(1)
    stubRects(range, [
      { left: 5, top: 5, width: 20, height: 20 },
      { left: 30, top: 5, width: 20, height: 20 },
    ])
    ov.redraw()
    expect(draw).toHaveBeenCalledTimes(2)
    // last rects length 2
    expect(draw.mock.calls[1][0]).toHaveLength(2)
  })

  it('accepts a range factory (Range | function)', () => {
    const range = mkRange()
    stubRects(range, [{ left: 0, top: 0, width: 10, height: 10 }])
    ov.add('k', () => range, Overlayer.highlight)
    expect(ov.has('k')).toBe(true)
  })

  it('hitTest returns [key, range] for point inside any rect', () => {
    const range = mkRange()
    stubRects(range, [{ left: 10, top: 10, width: 50, height: 20 }])
    ov.add('k', range, Overlayer.highlight)
    const [key, hit] = ov.hitTest({ x: 20, y: 15 })
    expect(key).toBe('k')
    expect(hit).toBe(range)
  })

  it('hitTest returns [] for point outside', () => {
    const range = mkRange()
    stubRects(range, [{ left: 10, top: 10, width: 50, height: 20 }])
    ov.add('k', range, Overlayer.highlight)
    const res = ov.hitTest({ x: 0, y: 0 })
    expect(res).toEqual([])
  })

  it('hitTest prefers most-recently-added on overlap', () => {
    const a = mkRange()
    const b = mkRange()
    stubRects(a, [{ left: 0, top: 0, width: 100, height: 100 }])
    stubRects(b, [{ left: 10, top: 10, width: 50, height: 50 }])
    ov.add('a', a, Overlayer.highlight)
    ov.add('b', b, Overlayer.highlight)
    const [key] = ov.hitTest({ x: 20, y: 20 })
    expect(key).toBe('b')
  })

  it('stores rects in doc coords and hitTest compensates when scrolled', () => {
    // Rect captured at scrollY=0 → doc rect == viewport rect.
    const range = mkRange()
    stubRects(range, [{ left: 10, top: 10, width: 50, height: 20 }])
    ov.add('k', range, Overlayer.highlight)

    // Simulate scroll. Rect "at viewport 10,10" when we captured it is now
    // at viewport y=-90 (i.e. scrolled off-screen). hitTest must take the
    // new scroll into account: a click at viewport (20, -85) should still
    // hit — since the rect's doc y is 10, and 10 + scrollY=100 == viewport -90.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 })
    const [key] = ov.hitTest({ x: 20, y: -85 })
    expect(key).toBe('k')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('syncScroll sets SVG counter-translate transform', () => {
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 5 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 40 })
    ov.syncScroll()
    expect(ov.element.style.transform).toBe('translate(-5px, -40px)')
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('drops zero-area rects (Firefox/Chromium can emit them at line breaks)', () => {
    const range = mkRange()
    stubRects(range, [
      { left: 10, top: 10, width: 50, height: 20 }, // real
      { left: 60, top: 10, width: 0, height: 20 }, // zero-width (column-break artifact)
      { left: 10, top: 30, width: 50, height: 0 }, // zero-height
    ])
    const draw = vi.fn(Overlayer.highlight)
    ov.add('k', range, draw)
    expect(draw.mock.calls[0][0]).toHaveLength(1)
  })

  it('uncollapses a collapsed range so first-of-paragraph anchors still draw', () => {
    // Start-of-paragraph caret: collapsed range returns no client rects.
    // captureRects must clone+extend it by one char and use those rects.
    const p = document.createElement('p')
    const text = document.createTextNode('hello world')
    p.appendChild(text)
    document.body.appendChild(p)
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 0)
    expect(range.collapsed).toBe(true)

    // Stub Range.prototype so the clone created inside captureRects also
    // returns our fake rects. Restore at the end so other tests aren't poisoned.
    const realFn = Range.prototype.getClientRects
    let nonCollapsedCalls = 0
    Range.prototype.getClientRects = function (this: Range): DOMRectList {
      if (this.collapsed) return [] as unknown as DOMRectList
      nonCollapsedCalls++
      return [
        { x: 0, y: 0, left: 0, top: 0, right: 6, bottom: 16, width: 6, height: 16, toJSON: () => ({}) },
      ] as unknown as DOMRectList
    }
    try {
      const draw = vi.fn(Overlayer.highlight)
      ov.add('k', range, draw)
      expect(nonCollapsedCalls).toBeGreaterThan(0)
      expect(draw.mock.calls[0][0]).toHaveLength(1)
    } finally {
      Range.prototype.getClientRects = realFn
    }
  })
})

describe('Overlayer draw palette', () => {
  function rects(): DOMRect[] {
    return [
      { left: 10, top: 20, right: 60, bottom: 40, width: 50, height: 20, x: 10, y: 20, toJSON: () => ({}) } as DOMRect,
    ]
  }

  it('highlight yields <g> with one <rect> per input', () => {
    const g = Overlayer.highlight(rects(), { color: '#ff0' })
    expect(g.tagName.toLowerCase()).toBe('g')
    expect(g.getAttribute('fill')).toBe('#ff0')
    expect(g.querySelectorAll('rect')).toHaveLength(1)
  })

  it('underline draws at bottom - strokeWidth', () => {
    const g = Overlayer.underline(rects(), { color: '#00f', width: 3 })
    const rect = g.querySelector('rect')!
    expect(Number(rect.getAttribute('y'))).toBe(40 - 3)
    expect(Number(rect.getAttribute('height'))).toBe(3)
  })

  it('outline draws a stroked rect with radius', () => {
    const g = Overlayer.outline(rects(), { color: 'red', width: 2, radius: 4 })
    const rect = g.querySelector('rect')!
    expect(rect.getAttribute('rx')).toBe('4')
    expect(g.getAttribute('stroke-width')).toBe('2')
  })

  it('squiggly produces one path per rect', () => {
    const g = Overlayer.squiggly(rects(), { color: '#0f0' })
    expect(g.querySelectorAll('path')).toHaveLength(1)
    expect(g.getAttribute('stroke')).toBe('#0f0')
  })

  it('strikethrough line is mid-rect', () => {
    const g = Overlayer.strikethrough(rects(), { color: '#000' })
    const rect = g.querySelector('rect')!
    expect(Number(rect.getAttribute('y'))).toBe((20 + 40) / 2)
  })

  it('pulse applies class for CSS animation', () => {
    const g = Overlayer.pulse(rects(), { color: 'orange' })
    expect(g.getAttribute('class')).toBe('reader-overlay-pulse')
  })
})
