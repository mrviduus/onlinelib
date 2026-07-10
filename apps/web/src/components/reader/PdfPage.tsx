import { useEffect, useRef } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'

interface PdfPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  /** ±1 ring — draw canvas + text layer now. */
  render: boolean
  /** ±2 ring — retain an already-drawn canvas; free once false. */
  keep: boolean
  invert: boolean
  /** CSS box at the current scale (from the page's unscaled viewport). */
  cssWidth: number
  cssHeight: number
  /** Registers this page's root element with the parent IntersectionObserver. */
  registerRef: (el: HTMLElement | null) => void
  /** Surfaced so the view can show a recoverable "session expired" state. */
  onLoadError?: (err: unknown) => void
}

/** pdfjs cancel/abort exceptions are expected on scroll/scale churn — ignore them. */
function isCancel(err: unknown): boolean {
  const name = (err as { name?: string })?.name || ''
  return /Cancel|Abort/i.test(name)
}

/**
 * One PDF page: a raster <canvas> plus a transparent, selectable pdf.js text
 * layer sharing the exact same box. Strict off-screen unmount is a hard
 * requirement — a 100-page PDF would otherwise OOM the tab. The canvas + text
 * layer are mounted ONLY while the page is inside the ±2 keep ring; leaving it
 * unmounts both nodes (so only ~6 canvases exist at once) and the browser frees
 * the detached backing bitmap. The effect cleanup also cancels any in-flight
 * render/text-layer task so nothing keeps drawing into a removed node.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  render,
  keep,
  invert,
  cssWidth,
  cssHeight,
  registerRef,
  onLoadError,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textLayerRef = useRef<TextLayer | null>(null)
  const drawnScaleRef = useRef<number | null>(null)

  const freeCanvas = () => {
    renderTaskRef.current?.cancel()
    renderTaskRef.current = null
    textLayerRef.current?.cancel()
    textLayerRef.current = null
    const canvas = canvasRef.current
    if (canvas) {
      // Zeroing the dimensions releases the backing bitmap immediately.
      canvas.width = 0
      canvas.height = 0
    }
    textRef.current?.replaceChildren()
    drawnScaleRef.current = null
  }

  useEffect(() => {
    // Beyond the keep ring → drop everything.
    if (!keep) {
      freeCanvas()
      return
    }
    // In keep ring but not render ring: retain the existing canvas, unless it
    // was drawn at a stale scale (then free so it redraws crisp on re-entry).
    if (!render) {
      if (drawnScaleRef.current !== null && drawnScaleRef.current !== scale) {
        freeCanvas()
      }
      return
    }
    // Already drawn at this scale — nothing to do.
    if (drawnScaleRef.current === scale) return

    let cancelled = false
    const draw = async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const canvas = canvasRef.current
        const textDiv = textRef.current
        if (!canvas || !textDiv) return

        const viewport = page.getViewport({ scale })
        const outputScale = window.devicePixelRatio || 1
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
        const task = page.render({ canvasContext: ctx, viewport, transform })
        renderTaskRef.current = task
        await task.promise
        if (cancelled) return

        // Text layer: transparent selectable spans positioned via --scale-factor.
        textDiv.replaceChildren()
        textDiv.style.setProperty('--scale-factor', String(scale))
        const tl = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        })
        textLayerRef.current = tl
        await tl.render()
        if (cancelled) return
        drawnScaleRef.current = scale
      } catch (err) {
        if (cancelled || isCancel(err)) return
        // Blank pages with no signal are the worst outcome (e.g. a mid-session
        // 401 on a lazy Range request) — surface it so the view can recover.
        onLoadError?.(err)
      }
    }
    void draw()

    return () => {
      cancelled = true
      // Cancel BOTH in-flight tasks — a lingering text-layer render on scale
      // change would otherwise orphan spans while a new layer starts.
      renderTaskRef.current?.cancel()
      textLayerRef.current?.cancel()
    }
  }, [pdf, pageNumber, scale, render, keep])

  // Free on unmount.
  useEffect(() => () => freeCanvas(), [])

  const active = render || keep

  return (
    <div
      ref={(el) => {
        registerRef(el)
      }}
      data-page={pageNumber}
      className={`pdf-page${invert ? ' pdf-page--invert' : ''}`}
      style={{ width: cssWidth, height: cssHeight }}
    >
      {/* Canvas + text layer mount only inside the keep ring; leaving it drops
          both nodes so the detached bitmap is freed (bounded ~6 canvases). */}
      {active ? (
        <>
          <canvas ref={canvasRef} className="pdf-page__canvas" />
          <div ref={textRef} className="textLayer" />
        </>
      ) : (
        <div className="pdf-page__placeholder">{pageNumber}</div>
      )}
    </div>
  )
}
