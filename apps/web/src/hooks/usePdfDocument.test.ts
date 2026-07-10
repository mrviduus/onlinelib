import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// The `?worker` import can't resolve under vitest — stub it with a raw-Worker
// mock that records every instance so we can assert per-document teardown.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?worker', () => ({
  default: vi.fn(function (this: { terminate: ReturnType<typeof vi.fn> }) {
    this.terminate = vi.fn()
    const g = globalThis as unknown as { __rawWorkers?: { terminate: ReturnType<typeof vi.fn> }[] }
    ;(g.__rawWorkers ||= []).push(this)
  }),
}))
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  // PDFWorker wraps the per-document port; destroy() must NOT be a shared singleton.
  PDFWorker: vi.fn(function (this: { destroy: ReturnType<typeof vi.fn> }) {
    this.destroy = vi.fn()
  }),
}))

import { getDocument } from 'pdfjs-dist'
import { usePdfDocument } from './usePdfDocument'

const mockGetDocument = getDocument as unknown as ReturnType<typeof vi.fn>
const rawWorkers = () =>
  (globalThis as unknown as { __rawWorkers?: { terminate: ReturnType<typeof vi.fn> }[] }).__rawWorkers ?? []

function makeTask(promise: Promise<unknown>) {
  return { promise, destroy: vi.fn().mockResolvedValue(undefined) }
}

describe('usePdfDocument lifecycle', () => {
  beforeEach(() => {
    mockGetDocument.mockReset()
    ;(globalThis as unknown as { __rawWorkers: unknown[] }).__rawWorkers = []
  })

  it('resolves the document, exposes numPages, and passes a per-document worker', async () => {
    const pdf = { numPages: 7, destroy: vi.fn().mockResolvedValue(undefined) }
    mockGetDocument.mockReturnValueOnce(makeTask(Promise.resolve(pdf)))

    const { result } = renderHook(() => usePdfDocument('/api/me/books/b1/file'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pdf).toBe(pdf)
    expect(result.current.numPages).toBe(7)
    expect(result.current.error).toBeNull()
    // A fresh worker was created and handed to getDocument (not a shared singleton).
    expect(rawWorkers()).toHaveLength(1)
    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/me/books/b1/file', withCredentials: true }),
    )
    expect(mockGetDocument.mock.calls[0][0].worker).toBeTruthy()
  })

  it('retries once, then surfaces an error after a second failure', async () => {
    const failed = makeTask(Promise.reject(new Error('boom')))
    const failed2 = makeTask(Promise.reject(new Error('boom again')))
    mockGetDocument.mockReturnValueOnce(failed).mockReturnValueOnce(failed2)

    const { result } = renderHook(() => usePdfDocument('/api/me/books/b1/file'))

    await waitFor(() => expect(result.current.error).toBe('boom again'))
    expect(mockGetDocument).toHaveBeenCalledTimes(2)
    // Each attempt got its OWN worker, and the failed attempt's task was destroyed.
    expect(rawWorkers()).toHaveLength(2)
    expect(failed.destroy).toHaveBeenCalled()
    expect(rawWorkers()[0].terminate).toHaveBeenCalled()
    expect(result.current.pdf).toBeNull()
  })

  it('destroys the resolved document AND its worker on unmount', async () => {
    const pdf = { numPages: 3, destroy: vi.fn().mockResolvedValue(undefined) }
    mockGetDocument.mockReturnValueOnce(makeTask(Promise.resolve(pdf)))

    const { result, unmount } = renderHook(() => usePdfDocument('/api/me/books/b1/file'))
    await waitFor(() => expect(result.current.pdf).toBe(pdf))

    unmount()
    expect(pdf.destroy).toHaveBeenCalled()
    // Worker torn down only after the doc destroy settles.
    await waitFor(() => expect(rawWorkers()[0].terminate).toHaveBeenCalled())
  })

  it('aborts an in-flight loading task + worker on unmount (no leaked download)', async () => {
    const task = makeTask(new Promise(() => {})) // never resolves
    mockGetDocument.mockReturnValueOnce(task)

    const { unmount } = renderHook(() => usePdfDocument('/api/me/books/b1/file'))
    await act(async () => {}) // let the effect start the load
    unmount()

    expect(task.destroy).toHaveBeenCalled()
    await waitFor(() => expect(rawWorkers()[0].terminate).toHaveBeenCalled())
  })

  it('reloads cleanly when reloadToken changes (fresh worker, no shared-port reuse)', async () => {
    const pdf1 = { numPages: 3, destroy: vi.fn().mockResolvedValue(undefined) }
    const pdf2 = { numPages: 3, destroy: vi.fn().mockResolvedValue(undefined) }
    mockGetDocument
      .mockReturnValueOnce(makeTask(Promise.resolve(pdf1)))
      .mockReturnValueOnce(makeTask(Promise.resolve(pdf2)))

    const { result, rerender } = renderHook(
      ({ token }) => usePdfDocument('/api/me/books/b1/file', token),
      { initialProps: { token: 0 } },
    )
    await waitFor(() => expect(result.current.pdf).toBe(pdf1))

    rerender({ token: 1 })
    await waitFor(() => expect(result.current.pdf).toBe(pdf2))
    // Second load used a brand-new worker (never the destroyed first one).
    expect(rawWorkers()).toHaveLength(2)
    expect(mockGetDocument).toHaveBeenCalledTimes(2)
  })
})
