import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Mock pdfjs so the page can "render" in jsdom without the real engine. The
// factory is fully self-contained (only `vi` + globalThis). NOTE: the component
// under test is imported AFTER the mock to avoid the vitest import-TDZ.
vi.mock('pdfjs-dist', () => ({
  TextLayer: vi.fn(function (this: { render: unknown; cancel: unknown }) {
    this.render = vi.fn().mockResolvedValue(undefined)
    this.cancel = vi.fn()
    const g = globalThis as unknown as { __pdfLayers?: { cancel: ReturnType<typeof vi.fn> }[] }
    ;(g.__pdfLayers ||= []).push(this as unknown as { cancel: ReturnType<typeof vi.fn> })
  }),
}))

import { PdfPage } from './PdfPage'

const createdLayers = () =>
  (globalThis as unknown as { __pdfLayers?: { cancel: ReturnType<typeof vi.fn> }[] }).__pdfLayers ?? []

function makePdf() {
  const renderTask = { promise: Promise.resolve(), cancel: vi.fn() }
  const page = {
    getViewport: vi.fn(() => ({ width: 100, height: 200 })),
    render: vi.fn(() => renderTask),
    streamTextContent: vi.fn(() => ({})),
  }
  const pdf = { getPage: vi.fn().mockResolvedValue(page) }
  return { pdf: pdf as never, page, renderTask }
}

describe('PdfPage off-screen unmount (memory hard-requirement)', () => {
  beforeEach(() => {
    ;(globalThis as any).__pdfLayers = []
    // jsdom has no 2D context; give the draw path a truthy one.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('unmounts the canvas + cancels tasks when leaving the keep ring', async () => {
    const { pdf, renderTask } = makePdf()
    const props = {
      pdf,
      pageNumber: 1,
      scale: 1,
      invert: false,
      cssWidth: 100,
      cssHeight: 200,
      registerRef: () => {},
    }
    const { container, rerender } = render(<PdfPage {...props} render keep />)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    // Wait until the mocked render populates real dimensions.
    await waitFor(() => expect(canvas.width).toBe(100))
    expect(canvas.height).toBe(200)
    expect(createdLayers()).toHaveLength(1)

    // Scroll past the keep ring: the canvas + text layer unmount so the browser
    // frees the detached bitmap (bounded ~6 canvases across the whole doc).
    rerender(<PdfPage {...props} render={false} keep={false} />)

    expect(container.querySelector('canvas')).toBeNull() // node unmounted
    expect(container.querySelector('.textLayer')).toBeNull()
    // Both the render task and the text layer are cancelled (guards the leak).
    expect(renderTask.cancel).toHaveBeenCalled()
    expect(createdLayers()[0].cancel).toHaveBeenCalled()
  })

  it('reports auth errors so the view can recover instead of blanking', async () => {
    const { pdf } = makePdf()
    ;(pdf as unknown as { getPage: ReturnType<typeof vi.fn> }).getPage.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    )
    const onLoadError = vi.fn()
    render(
      <PdfPage
        pdf={pdf}
        pageNumber={1}
        scale={1}
        render
        keep
        invert={false}
        cssWidth={100}
        cssHeight={200}
        registerRef={() => {}}
        onLoadError={onLoadError}
      />,
    )
    await waitFor(() => expect(onLoadError).toHaveBeenCalledTimes(1))
    expect((onLoadError.mock.calls[0][0] as { status?: number }).status).toBe(401)
  })
})
