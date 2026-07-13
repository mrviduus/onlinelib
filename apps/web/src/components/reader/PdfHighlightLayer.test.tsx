import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PdfHighlightLayer } from './PdfHighlightLayer'
import type { StoredHighlight } from '../../lib/offlineDb'
import type { PdfAnchor } from '@textstack/shared'

function pdfHighlight(id: string, page: number, rects: PdfAnchor['rects']): StoredHighlight {
  return {
    id,
    editionId: '',
    chapterId: '',
    userBookId: 'bk-1',
    anchor: { v: 1, kind: 'pdf', page, rects, exact: 'x' },
    color: 'yellow',
    selectedText: 'x',
    syncStatus: 'synced',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  }
}

function reflowHighlight(id: string): StoredHighlight {
  return {
    id,
    editionId: 'ed-1',
    chapterId: 'ch-1',
    anchor: { prefix: 'a', exact: 'b', suffix: 'c', startOffset: 0, endOffset: 1, chapterId: 'ch-1' },
    color: 'green',
    selectedText: 'b',
    syncStatus: 'synced',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('PdfHighlightLayer', () => {
  it('paints only highlights on this page, scaled', () => {
    const highlights = [
      pdfHighlight('a', 2, [{ x: 10, y: 20, w: 30, h: 8 }]),
      pdfHighlight('b', 3, [{ x: 0, y: 0, w: 5, h: 5 }]),
    ]
    const { container } = render(
      <PdfHighlightLayer page={2} highlights={highlights} scale={2} />,
    )
    const rects = container.querySelectorAll<HTMLElement>('.pdf-hl-rect')
    expect(rects).toHaveLength(1)
    // paintRect at scale 2: left 20, top 40, width 60, height 16
    expect(rects[0].style.left).toBe('20px')
    expect(rects[0].style.top).toBe('40px')
    expect(rects[0].style.width).toBe('60px')
    expect(rects[0].style.height).toBe('16px')
  })

  it('renders one rect per stored quad', () => {
    const highlights = [
      pdfHighlight('a', 1, [
        { x: 0, y: 0, w: 10, h: 5 },
        { x: 0, y: 6, w: 8, h: 5 },
      ]),
    ]
    const { container } = render(<PdfHighlightLayer page={1} highlights={highlights} scale={1} />)
    expect(container.querySelectorAll('.pdf-hl-rect')).toHaveLength(2)
  })

  it('ignores reflow (non-pdf) highlights', () => {
    const { container } = render(
      <PdfHighlightLayer page={1} highlights={[reflowHighlight('r')]} scale={1} />,
    )
    expect(container.querySelector('.pdf-hl-layer')).toBeNull()
  })

  it('fires onHighlightClick with the highlight', () => {
    const onClick = vi.fn()
    const h = pdfHighlight('a', 1, [{ x: 1, y: 1, w: 10, h: 5 }])
    const { container } = render(
      <PdfHighlightLayer page={1} highlights={[h]} scale={1} onHighlightClick={onClick} />,
    )
    fireEvent.click(container.querySelector('.pdf-hl-rect')!)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0][0]).toBe(h)
  })

  it('applies the invert modifier class in dim mode', () => {
    const h = pdfHighlight('a', 1, [{ x: 1, y: 1, w: 10, h: 5 }])
    const { container } = render(
      <PdfHighlightLayer page={1} highlights={[h]} scale={1} invert />,
    )
    expect(container.querySelector('.pdf-hl-layer--invert')).not.toBeNull()
  })
})
