import { describe, it, expect } from 'vitest'
import {
  buildPdfAnchor,
  paintRect,
  isPdfAnchor,
  type PdfAnchor,
} from './pdfHighlightAnchor'

describe('buildPdfAnchor', () => {
  const pageRect = { left: 100, top: 200, width: 400, height: 600 }

  it('converts client rects to page-relative unscaled coords', () => {
    const a = buildPdfAnchor(
      3,
      pageRect,
      [{ left: 150, top: 260, width: 80, height: 20 }],
      2,
      'hello',
    )
    expect(a.v).toBe(1)
    expect(a.kind).toBe('pdf')
    expect(a.page).toBe(3)
    expect(a.exact).toBe('hello')
    // (150-100)/2 = 25, (260-200)/2 = 30, 80/2 = 40, 20/2 = 10
    expect(a.rects).toEqual([{ x: 25, y: 30, w: 40, h: 10 }])
  })

  it('round-trips through paintRect back to page-space CSS box', () => {
    const scale = 1.5
    const client = { left: 130, top: 230, width: 60, height: 18 }
    const a = buildPdfAnchor(1, pageRect, [client], scale, 'x')
    const painted = paintRect(a.rects[0], scale)
    // left/top are page-relative (client minus page origin); width/height 1:1.
    expect(painted.left).toBeCloseTo(client.left - pageRect.left, 5)
    expect(painted.top).toBeCloseTo(client.top - pageRect.top, 5)
    expect(painted.width).toBeCloseTo(client.width, 5)
    expect(painted.height).toBeCloseTo(client.height, 5)
  })

  it('drops zero-area rects', () => {
    const a = buildPdfAnchor(
      1,
      pageRect,
      [
        { left: 150, top: 260, width: 0, height: 20 },
        { left: 150, top: 260, width: 80, height: 0 },
        { left: 150, top: 260, width: 80, height: 20 },
      ],
      1,
      't',
    )
    expect(a.rects).toHaveLength(1)
  })

  it('center-filters rects that spill onto the next page (start-page clamp)', () => {
    const a = buildPdfAnchor(
      1,
      pageRect,
      [
        // center inside page → kept
        { left: 150, top: 260, width: 80, height: 20 },
        // center below page bottom (top=790, center 800 > 200+600=800? equal edge) → keep edge
        { left: 150, top: 900, width: 80, height: 20 }, // center y = 910 > 800 → dropped
        // center to the right of page → dropped
        { left: 700, top: 260, width: 80, height: 20 }, // center x = 740 > 500 → dropped
      ],
      1,
      't',
    )
    expect(a.rects).toHaveLength(1)
    expect(a.rects[0]).toEqual({ x: 50, y: 60, w: 80, h: 20 })
  })

  it('defaults a zero/NaN scale to 1', () => {
    const a = buildPdfAnchor(1, pageRect, [{ left: 150, top: 260, width: 80, height: 20 }], 0, 't')
    expect(a.rects[0]).toEqual({ x: 50, y: 60, w: 80, h: 20 })
  })

  // Boundary coverage for the center-filter (`cx <= right && cy <= bottom`) and
  // the size threshold (`w > 0.5 && h > 0.5`). pageRect right = 500, bottom = 800.
  it('keeps a rect whose center sits EXACTLY on the right/bottom edge (<=)', () => {
    // left 460 + w 80 → cx 500 === right; top 760 + h 80 → cy 800 === bottom.
    const a = buildPdfAnchor(1, pageRect, [{ left: 460, top: 760, width: 80, height: 80 }], 1, 'edge')
    expect(a.rects).toHaveLength(1)
  })

  it('drops a rect whose center is 1px past the right/bottom edge', () => {
    const pastRight = buildPdfAnchor(1, pageRect, [{ left: 461, top: 760, width: 80, height: 80 }], 1, 'x')
    expect(pastRight.rects).toHaveLength(0) // cx 501 > 500
    const pastBottom = buildPdfAnchor(1, pageRect, [{ left: 460, top: 761, width: 80, height: 80 }], 1, 'x')
    expect(pastBottom.rects).toHaveLength(0) // cy 801 > 800
  })

  it('drops a rect at the size threshold (w/h must be strictly > 0.5)', () => {
    const atThreshold = buildPdfAnchor(1, pageRect, [{ left: 150, top: 260, width: 0.5, height: 20 }], 1, 'x')
    expect(atThreshold.rects).toHaveLength(0) // 0.5 is not > 0.5
    const overThreshold = buildPdfAnchor(1, pageRect, [{ left: 150, top: 260, width: 0.6, height: 0.6 }], 1, 'x')
    expect(overThreshold.rects).toHaveLength(1) // 0.6 > 0.5 and center inside
  })
})

describe('isPdfAnchor', () => {
  it('is true for a pdf anchor', () => {
    const a: PdfAnchor = { v: 1, kind: 'pdf', page: 1, rects: [], exact: '' }
    expect(isPdfAnchor(a)).toBe(true)
  })

  it('is false for a reflow text anchor', () => {
    const reflow = {
      prefix: 'a',
      exact: 'b',
      suffix: 'c',
      startOffset: 0,
      endOffset: 1,
      chapterId: 'ch',
    }
    expect(isPdfAnchor(reflow)).toBe(false)
  })

  it('is false for null / undefined / primitives', () => {
    expect(isPdfAnchor(null)).toBe(false)
    expect(isPdfAnchor(undefined)).toBe(false)
    expect(isPdfAnchor('pdf')).toBe(false)
    expect(isPdfAnchor(42)).toBe(false)
  })
})
