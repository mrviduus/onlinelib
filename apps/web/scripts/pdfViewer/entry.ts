// Vanilla-DOM PDF viewer controller for the MOBILE reader WebView (ADR-012 S4b).
//
// This is the non-React port of the web reader's Original-layout PDF view. It
// runs INSIDE a react-native-webview (no React), so the virtualization that
// PdfOriginalView.tsx + PdfPage.tsx + usePdfDocument.ts express as hooks is
// rewritten as an imperative controller. The PURE virtualization math is reused
// VERBATIM from @textstack/shared (computePageRings / resolveOpenPage /
// topVisiblePage / clampPage / dimsReadyUpTo) so web + mobile can never drift.
//
// Differences from web (intentional, see S4b notes):
//   - Auth: mobile has no cookies, so pdf.js gets `httpHeaders: { Authorization }`
//     + `withCredentials:false` (web uses `withCredentials:true`). Token comes in
//     via `window.__TS_PDF`.
//   - Scroll container: the WHOLE WebView body scrolls (window scroll) rather than
//     an inner overflow div — this lets the shared selection bridge's window-scroll
//     `scrollDir` detector drive the immersive chrome unchanged, and lets the
//     IntersectionObserver use the viewport as root.
//   - Worker: instantiated from a Blob built from the bundled legacy worker source
//     (`window.__TS_PDF_WORKER_SRC`, injected by the generated bundle) so canvas
//     raster stays off the UI thread on Android.
//   - No zoom/toolbar/invert/session-banner UI (that chrome is S4c) — just render +
//     selectable text + page-change + error/auth messages back to RN.
//   - Progress persistence is RN's job in S4c; here we only POST the top-visible
//     page so RN can restore it after a token-refresh reload.
//
// Bundled to an IIFE (es2017, minified) by apps/web/scripts/build-mobile-pdf.mjs.

// pdf.js LEGACY build — downlevelled for old Android Chromium WebViews.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.mjs'
import {
  computePageRings,
  resolveOpenPage,
  topVisiblePage,
  clampPage,
  dimsReadyUpTo,
} from '../../../../packages/shared/src/reader/pdfPageWindow'

interface PdfBootstrap {
  url: string
  token: string | null
  initialPage: number | null
}

interface PageDim {
  w: number
  h: number
}

interface PageState {
  el: HTMLElement
  canvas: HTMLCanvasElement | null
  textDiv: HTMLDivElement | null
  drawnScale: number | null
  renderTask: { cancel: () => void; promise: Promise<void> } | null
  textLayer: { cancel: () => void } | null
}

const FALLBACK_DIM: PageDim = { w: 612, h: 792 } // US Letter @72dpi
const HORIZONTAL_PAD = 24
const PAGE_REPORT_THROTTLE_MS = 200

function post(msg: Record<string, unknown>): void {
  try {
    const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
    rn && rn.postMessage(JSON.stringify(msg))
  } catch {
    /* not in a WebView */
  }
}

/** 401/403-ish rejection from a lazy Range request after the token expired. */
function isAuthError(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return true
  const e = err as { message?: string; name?: string }
  return /401|403|unauthor|forbidden/i.test(`${e?.message || ''} ${e?.name || ''}`)
}

/** pdf.js cancel/abort exceptions are expected on scroll churn — ignore them. */
function isCancel(err: unknown): boolean {
  const name = (err as { name?: string })?.name || ''
  return /Cancel|Abort/i.test(name)
}

function main(): void {
  const cfg = (window as unknown as { __TS_PDF?: PdfBootstrap }).__TS_PDF
  if (!cfg || !cfg.url) {
    post({ type: 'pdfLoadError', message: 'missing bootstrap' })
    return
  }

  // --- Real worker off the UI thread: Blob → object URL → workerSrc. The
  //     bundled legacy worker source is injected as a global string by the
  //     generated bundle. Fallback to disableWorker only if it's absent. ---
  try {
    const workerSource = (window as unknown as { __TS_PDF_WORKER_SRC?: string }).__TS_PDF_WORKER_SRC
    if (workerSource) {
      const blob = new Blob([workerSource], { type: 'application/javascript' })
      ;(pdfjsLib as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
        URL.createObjectURL(blob)
    }
  } catch (e) {
    console.warn('[pdf] worker blob setup failed', (e as Error)?.message)
  }

  const root = document.getElementById('pdf-root') || document.body
  const pagesEl = document.createElement('div')
  pagesEl.className = 'pdf-pages'
  root.appendChild(pagesEl)

  let pdf: {
    numPages: number
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number }
      render: (o: unknown) => { cancel: () => void; promise: Promise<void> }
      streamTextContent: () => unknown
    }>
    destroy: () => Promise<void>
  } | null = null
  let numPages = 0
  let scale = 1
  const pageDims: (PageDim | undefined)[] = []
  const states = new Map<number, PageState>()
  const visible = new Set<number>()
  let observer: IntersectionObserver | null = null
  let didInitialScroll = false
  let pendingTarget: number | null = null
  let lastReportedPage = -1
  let lastPageReportAt = 0
  const openPage = resolveOpenPage(cfg.initialPage)

  function containerWidth(): number {
    return window.innerWidth || document.documentElement.clientWidth || 360
  }

  function computeScale(): number {
    const base = pageDims[0] || FALLBACK_DIM
    const fit = (containerWidth() - HORIZONTAL_PAD) / base.w
    return Math.min(5, Math.max(0.2, fit))
  }

  function pageBox(pn: number): { w: number; h: number } {
    const dim = pageDims[pn - 1] || pageDims[0] || FALLBACK_DIM
    return { w: Math.round(dim.w * scale), h: Math.round(dim.h * scale) }
  }

  function applyPlaceholderSizes(): void {
    states.forEach((st, pn) => {
      const box = pageBox(pn)
      st.el.style.width = box.w + 'px'
      st.el.style.height = box.h + 'px'
    })
  }

  function freePage(st: PageState): void {
    if (st.renderTask) { try { st.renderTask.cancel() } catch { /* noop */ } st.renderTask = null }
    if (st.textLayer) { try { st.textLayer.cancel() } catch { /* noop */ } st.textLayer = null }
    if (st.canvas) {
      st.canvas.width = 0
      st.canvas.height = 0
      if (st.canvas.parentNode) st.canvas.parentNode.removeChild(st.canvas)
      st.canvas = null
    }
    if (st.textDiv) {
      if (st.textDiv.parentNode) st.textDiv.parentNode.removeChild(st.textDiv)
      st.textDiv = null
    }
    st.drawnScale = null
    const ph = st.el.querySelector('.pdf-page__placeholder') as HTMLElement | null
    if (ph) ph.style.display = ''
  }

  async function drawPage(pn: number, st: PageState): Promise<void> {
    if (!pdf) return
    if (st.drawnScale === scale) return
    // Redraw at new scale — drop the stale canvas first.
    if (st.drawnScale !== null) freePage(st)
    try {
      const page = await pdf.getPage(pn)
      if (!states.has(pn) || states.get(pn) !== st) return
      const viewport = page.getViewport({ scale })
      const outputScale = window.devicePixelRatio || 1

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-page__canvas'
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = Math.floor(viewport.width) + 'px'
      canvas.style.height = Math.floor(viewport.height) + 'px'
      st.el.appendChild(canvas)
      st.canvas = canvas
      const ph = st.el.querySelector('.pdf-page__placeholder') as HTMLElement | null
      if (ph) ph.style.display = 'none'

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
      const task = page.render({ canvasContext: ctx, viewport, transform }) as PageState['renderTask']
      st.renderTask = task
      await task!.promise
      if (states.get(pn) !== st) return

      const textDiv = document.createElement('div')
      textDiv.className = 'textLayer'
      textDiv.style.setProperty('--scale-factor', String(scale))
      textDiv.style.width = Math.floor(viewport.width) + 'px'
      textDiv.style.height = Math.floor(viewport.height) + 'px'
      st.el.appendChild(textDiv)
      st.textDiv = textDiv
      const TextLayerCtor = (pdfjsLib as unknown as { TextLayer: new (o: unknown) => { render: () => Promise<void>; cancel: () => void } }).TextLayer
      const tl = new TextLayerCtor({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      })
      st.textLayer = tl
      await tl.render()
      if (states.get(pn) !== st) return
      st.drawnScale = scale
    } catch (err) {
      if (isCancel(err)) return
      if (isAuthError(err)) {
        // A mid-read Range 401 → ask RN to silently refresh + reload (S4b:
        // no visible banner). RN rebuilds the source with a fresh token,
        // restoring the current page.
        post({ type: 'pdfAuthExpired' })
        return
      }
      console.warn('[pdf] page render failed', pn, (err as Error)?.message)
    }
  }

  function syncRings(): void {
    if (!numPages) return
    const rings = computePageRings(visible, numPages)
    // Free anything outside the keep ring.
    states.forEach((st, pn) => {
      if (!rings.keep.has(pn)) {
        if (st.drawnScale !== null || st.canvas) freePage(st)
      }
    })
    // Draw pages in the render ring.
    rings.render.forEach((pn) => {
      const st = states.get(pn)
      if (st && st.drawnScale !== scale) void drawPage(pn, st)
    })
  }

  function reportTopPage(): void {
    const now = Date.now()
    if (now - lastPageReportAt < PAGE_REPORT_THROTTLE_MS) return
    lastPageReportAt = now
    const top = topVisiblePage(visible, openPage)
    if (top === lastReportedPage) return
    lastReportedPage = top
    post({ type: 'pdfPage', page: top, numPages })
  }

  function scrollToPageEl(pn: number): void {
    const st = states.get(pn)
    if (!st) return
    const y = st.el.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, Math.max(0, y))
  }

  function jumpToPage(raw: number): void {
    const target = clampPage(raw, numPages)
    pendingTarget = target
    scrollToPageEl(target)
  }

  function buildPageEls(): void {
    const frag = document.createDocumentFragment()
    for (let pn = 1; pn <= numPages; pn++) {
      const el = document.createElement('div')
      el.className = 'pdf-page'
      el.dataset.page = String(pn)
      const box = pageBox(pn)
      el.style.width = box.w + 'px'
      el.style.height = box.h + 'px'
      const ph = document.createElement('div')
      ph.className = 'pdf-page__placeholder'
      ph.textContent = String(pn)
      el.appendChild(ph)
      frag.appendChild(el)
      states.set(pn, { el, canvas: null, textDiv: null, drawnScale: null, renderTask: null, textLayer: null })
    }
    pagesEl.appendChild(frag)
  }

  function observeAll(): void {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const pn = Number((e.target as HTMLElement).dataset.page)
          if (!pn) continue
          if (e.isIntersecting) visible.add(pn)
          else visible.delete(pn)
        }
        syncRings()
        reportTopPage()
      },
      { root: null, rootMargin: '300px 0px' },
    )
    states.forEach((st) => observer!.observe(st.el))
  }

  async function prefetchDims(): Promise<void> {
    if (!pdf) return
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i)
        const vp = page.getViewport({ scale: 1 })
        pageDims[i - 1] = { w: vp.width, h: vp.height }
        if (i === 1) {
          // First real dim → recompute scale + placeholder sizes.
          scale = computeScale()
          applyPlaceholderSizes()
        }
        if (i % 10 === 0) applyPlaceholderSizes()
      } catch {
        /* keep fallback dim */
      }
      // Once heights above the initial target have streamed in, correct the
      // one-shot initial scroll so it lands precisely (mirrors web).
      if (!didInitialScroll && dimsReadyUpTo(pageDims, openPage)) {
        didInitialScroll = true
        applyPlaceholderSizes()
        requestAnimationFrame(() => jumpToPage(openPage))
      }
      if (pendingTarget != null && dimsReadyUpTo(pageDims, pendingTarget)) {
        const t = pendingTarget
        pendingTarget = null
        requestAnimationFrame(() => scrollToPageEl(t))
      }
    }
    applyPlaceholderSizes()
    syncRings()
  }

  async function loadDocument(attempt: number): Promise<void> {
    const params: Record<string, unknown> = {
      url: cfg.url,
      withCredentials: false,
      // Lazy Range streaming (default) → instant first paint + bounded memory.
    }
    if (cfg.token) params.httpHeaders = { Authorization: 'Bearer ' + cfg.token }
    try {
      const task = (pdfjsLib as unknown as { getDocument: (o: unknown) => { promise: Promise<typeof pdf> } }).getDocument(params)
      pdf = await task.promise
      if (!pdf) throw new Error('empty document')
      numPages = pdf.numPages
      buildPageEls()
      scale = computeScale()
      applyPlaceholderSizes()
      observeAll()
      post({ type: 'pdfReady', numPages })
      void prefetchDims()
    } catch (err) {
      if (isAuthError(err)) {
        post({ type: 'pdfAuthExpired' })
        return
      }
      if (attempt === 0) {
        await loadDocument(1)
        return
      }
      post({ type: 'pdfLoadError', message: (err as Error)?.message || 'failed to load pdf' })
    }
  }

  // Inbound: RN asks us to scroll to a page (TOC jump / restore).
  ;(window as unknown as { scrollToPage: (n: number) => void }).scrollToPage = (n: number) => {
    if (numPages) jumpToPage(n)
    else {
      // Not ready yet — remember it as the open target.
      pendingTarget = n
    }
  }

  // Re-scale on rotation / resize.
  let resizeRaf = 0
  window.addEventListener('resize', () => {
    if (resizeRaf) return
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0
      const next = computeScale()
      if (Math.abs(next - scale) < 0.001) return
      scale = next
      applyPlaceholderSizes()
      // Force redraw of on-screen pages at the new scale.
      states.forEach((st) => { if (st.drawnScale !== null) freePage(st) })
      syncRings()
    })
  })

  void loadDocument(0)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}
