import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Overlayer } from '@textstack/reader-overlay'
import { useOverlayAnnotations, type AnnotationSpec } from './useOverlayAnnotations'

function stubRects(range: Range): void {
  Object.defineProperty(range, 'getClientRects', {
    configurable: true,
    value: () =>
      ({
        length: 1,
        item: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }),
        [Symbol.iterator]: function* () {
          yield { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 } as DOMRect
        },
      }) as unknown as DOMRectList,
  })
}

interface Item {
  id: string
}

function mkRange(text = 'abc'): Range {
  const p = document.createElement('p')
  p.textContent = text
  document.body.appendChild(p)
  const r = document.createRange()
  r.selectNodeContents(p)
  stubRects(r)
  return r
}

describe('useOverlayAnnotations', () => {
  let overlayer: Overlayer
  const map = (item: Item): AnnotationSpec<Item> => ({
    item,
    key: item.id,
    range: mkRange(item.id),
  })

  beforeEach(() => {
    overlayer = new Overlayer()
    document.body.appendChild(overlayer.element)
  })

  it('adds one overlay entry per item under a namespace prefix', () => {
    renderHook(() =>
      useOverlayAnnotations(overlayer, {
        namespace: 'hl',
        items: [{ id: 'a' }, { id: 'b' }],
        draw: Overlayer.highlight,
        map,
      }),
    )
    expect(overlayer.has('hl:a')).toBe(true)
    expect(overlayer.has('hl:b')).toBe(true)
    expect(overlayer.size).toBe(2)
  })

  it('removes entries when items list shrinks', () => {
    const { rerender } = renderHook(
      ({ items }: { items: Item[] }) =>
        useOverlayAnnotations(overlayer, {
          namespace: 'hl',
          items,
          draw: Overlayer.highlight,
          map,
        }),
      { initialProps: { items: [{ id: 'a' }, { id: 'b' }] } },
    )
    rerender({ items: [{ id: 'a' }] })
    expect(overlayer.has('hl:a')).toBe(true)
    expect(overlayer.has('hl:b')).toBe(false)
  })

  it('leaves other namespaces alone', () => {
    const otherRange = mkRange('other')
    overlayer.add('vocab:x', otherRange, Overlayer.underline)
    renderHook(() =>
      useOverlayAnnotations(overlayer, {
        namespace: 'hl',
        items: [{ id: 'a' }],
        draw: Overlayer.highlight,
        map,
      }),
    )
    expect(overlayer.has('vocab:x')).toBe(true)
    expect(overlayer.has('hl:a')).toBe(true)
  })

  it('clears its namespace on unmount', () => {
    const otherRange = mkRange('other')
    overlayer.add('vocab:x', otherRange, Overlayer.underline)
    const { unmount } = renderHook(() =>
      useOverlayAnnotations(overlayer, {
        namespace: 'hl',
        items: [{ id: 'a' }, { id: 'b' }],
        draw: Overlayer.highlight,
        map,
      }),
    )
    unmount()
    expect(overlayer.has('hl:a')).toBe(false)
    expect(overlayer.has('hl:b')).toBe(false)
    expect(overlayer.has('vocab:x')).toBe(true)
  })

  it('is a no-op when enabled=false', () => {
    renderHook(() =>
      useOverlayAnnotations(overlayer, {
        namespace: 'hl',
        items: [{ id: 'a' }],
        draw: Overlayer.highlight,
        map,
        enabled: false,
      }),
    )
    expect(overlayer.size).toBe(0)
  })

  it('skips items whose map returns null or null-range', () => {
    const nullMap = (item: Item): AnnotationSpec<Item> | null =>
      item.id === 'skip' ? null : { item, key: item.id, range: mkRange() }
    renderHook(() =>
      useOverlayAnnotations(overlayer, {
        namespace: 'hl',
        items: [{ id: 'a' }, { id: 'skip' }, { id: 'b' }],
        draw: Overlayer.highlight,
        map: nullMap,
      }),
    )
    expect(overlayer.size).toBe(2)
    expect(overlayer.has('hl:skip')).toBe(false)
  })
})
