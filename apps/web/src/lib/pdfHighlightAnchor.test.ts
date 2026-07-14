import { describe, it, expect, beforeEach } from 'vitest'
import { computePdfAnchorFromRange } from './pdfHighlightAnchor'

// Build: <div.pdf-original__pages data-scale><div.pdf-page data-page><span>text</span></div></div>
function mountPdfDom(scale: number, page: number) {
  const pages = document.createElement('div')
  pages.className = 'pdf-original__pages'
  pages.dataset.scale = String(scale)

  const pageEl = document.createElement('div')
  pageEl.className = 'pdf-page'
  pageEl.dataset.page = String(page)
  // jsdom has no layout — stub the page box.
  pageEl.getBoundingClientRect = () =>
    ({ left: 100, top: 200, width: 400, height: 600, right: 500, bottom: 800, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect

  const span = document.createElement('span')
  span.textContent = 'anchored'
  pageEl.appendChild(span)
  pages.appendChild(pageEl)
  document.body.appendChild(pages)
  return { pages, pageEl, span }
}

function fakeRange(startContainer: Node, clientRects: Array<Partial<DOMRect>>, text: string): Range {
  return {
    startContainer,
    getClientRects: () => clientRects as unknown as DOMRectList,
    toString: () => text,
  } as unknown as Range
}

describe('computePdfAnchorFromRange', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('builds a page-relative unscaled anchor from a range inside a pdf page', () => {
    const { pages, span } = mountPdfDom(2, 5)
    const range = fakeRange(
      span.firstChild!,
      [{ left: 150, top: 260, width: 80, height: 20 }],
      'anchored',
    )
    const anchor = computePdfAnchorFromRange(range, pages)
    expect(anchor).not.toBeNull()
    expect(anchor!.page).toBe(5)
    expect(anchor!.exact).toBe('anchored')
    // (150-100)/2=25, (260-200)/2=30, 80/2=40, 20/2=10
    expect(anchor!.rects).toEqual([{ x: 25, y: 30, w: 40, h: 10 }])
  })

  it('reads data-scale from the pages container (nearest ancestor)', () => {
    const { pages, span } = mountPdfDom(1, 2)
    const range = fakeRange(span.firstChild!, [{ left: 140, top: 240, width: 60, height: 12 }], 'x')
    const anchor = computePdfAnchorFromRange(range, pages)
    // scale 1 → coords are just page-relative
    expect(anchor!.rects[0]).toEqual({ x: 40, y: 40, w: 60, h: 12 })
  })

  it('returns null when the range is not inside a pdf page', () => {
    const orphan = document.createElement('span')
    orphan.textContent = 'loose'
    document.body.appendChild(orphan)
    const range = fakeRange(orphan.firstChild!, [{ left: 10, top: 10, width: 5, height: 5 }], 'loose')
    expect(computePdfAnchorFromRange(range, null)).toBeNull()
  })

  it('returns null when no rects land inside the page box', () => {
    const { pages, span } = mountPdfDom(1, 1)
    // rect center far below the page → center-filtered away → no rects
    const range = fakeRange(span.firstChild!, [{ left: 150, top: 5000, width: 80, height: 20 }], 't')
    expect(computePdfAnchorFromRange(range, pages)).toBeNull()
  })
})
