import { useEffect, useState } from 'react'
import { getDocument, PDFWorker, type PDFDocumentProxy } from 'pdfjs-dist'
// Vite bundles the worker as a separate chunk via the `?worker` suffix.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

export interface PdfDocumentState {
  pdf: PDFDocumentProxy | null
  numPages: number
  loading: boolean
  error: string | null
}

/** Destroy the per-document worker. `PDFWorker` created from a port doesn't own
 *  the raw Worker, so terminate that explicitly. Both calls are idempotent. */
function teardownWorker(pdfWorker: PDFWorker | null, rawWorker: Worker | null): void {
  try {
    pdfWorker?.destroy()
  } catch {
    /* already torn down */
  }
  try {
    rawWorker?.terminate()
  } catch {
    /* already terminated */
  }
}

/**
 * Loads a whole-book PDF via pdf.js. Web auth is cookie-based (httpOnly,
 * same-origin `/api`), so we pass `withCredentials: true` rather than a Bearer
 * header. A single mid-stream failure (e.g. a cookie refresh landing between
 * Range requests) is retried once before surfacing an error.
 *
 * Each load spins up its OWN pdf.js worker (NOT a module singleton): tearing a
 * loading task down on unmount aborts the 21MB download without killing a
 * shared worker that a subsequent load — a remount from toggling Original
 * off→on, React StrictMode's double-invoke, or the `reloadToken` 401-recovery —
 * would need (that caused "PDFWorker.fromPort - the worker is being destroyed").
 *
 * `reloadToken` — bump to force a fresh `getDocument` (session-expired recovery).
 */
export function usePdfDocument(url: string | null, reloadToken = 0): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({
    pdf: null,
    numPages: 0,
    loading: !!url,
    error: null,
  })

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, numPages: 0, loading: false, error: null })
      return
    }
    let cancelled = false
    let activePdf: PDFDocumentProxy | null = null
    let activeTask: ReturnType<typeof getDocument> | null = null
    let activePdfWorker: PDFWorker | null = null
    let activeRawWorker: Worker | null = null
    setState({ pdf: null, numPages: 0, loading: true, error: null })

    const load = async (attempt: number): Promise<void> => {
      // Fresh worker per document — a brand-new port is never in pdf.js's
      // fromPort cache, so destroying it can't strand the next load.
      const rawWorker: Worker = new PdfWorker()
      // pdf.js's shipped ctor .d.ts mistypes `port` as `null` (inferred from its
      // `= null` default); the real PDFWorkerParameters accepts a Worker. Cast.
      const pdfWorker = new PDFWorker(
        { port: rawWorker } as unknown as ConstructorParameters<typeof PDFWorker>[0],
      )
      activeRawWorker = rawWorker
      activePdfWorker = pdfWorker
      const task = getDocument({ url, worker: pdfWorker, withCredentials: true })
      activeTask = task
      try {
        const pdf = await task.promise
        if (cancelled) {
          pdf.destroy().catch(() => {})
          teardownWorker(pdfWorker, rawWorker)
          return
        }
        activePdf = pdf
        activeTask = null
        setState({ pdf, numPages: pdf.numPages, loading: false, error: null })
      } catch (err) {
        // Destroy the failed task + its worker before retrying/erroring.
        task.destroy().catch(() => {})
        teardownWorker(pdfWorker, rawWorker)
        if (activeTask === task) activeTask = null
        if (activePdfWorker === pdfWorker) activePdfWorker = null
        if (activeRawWorker === rawWorker) activeRawWorker = null
        if (cancelled) return
        if (attempt === 0) {
          // Re-open once — covers a transient auth/stream drop.
          await load(1)
          return
        }
        setState({
          pdf: null,
          numPages: 0,
          loading: false,
          error: (err as Error)?.message || 'Failed to load the original PDF.',
        })
      }
    }
    void load(0)

    return () => {
      cancelled = true
      const pdf = activePdf
      const task = activeTask
      const pdfWorker = activePdfWorker
      const rawWorker = activeRawWorker
      activePdf = null
      activeTask = null
      activePdfWorker = null
      activeRawWorker = null
      // Stop the doc / in-flight download first, THEN tear down its worker.
      const done = pdf ? pdf.destroy() : task ? task.destroy() : Promise.resolve()
      done.catch(() => {}).finally(() => teardownWorker(pdfWorker, rawWorker))
    }
  }, [url, reloadToken])

  return state
}
