import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { PdfDocumentState } from '../../../hooks/usePdfDocument'

// Mock the heavy pdf.js-backed deps so the component mounts in jsdom without a worker.
const docState: { current: PdfDocumentState } = {
  current: { pdf: null, numPages: 0, loading: true, error: null },
}
vi.mock('../../../hooks/usePdfDocument', () => ({
  usePdfDocument: () => docState.current,
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('../PdfPage', () => ({ PdfPage: () => null }))

import PdfOriginalView from '../PdfOriginalView'

const baseProps = {
  fileUrl: 'http://x/file.pdf',
  bookId: 'b1',
  initialPage: null,
  scrollToPage: null,
}

describe('PdfOriginalView — onLoadError fallback (ADR-012)', () => {
  beforeEach(() => {
    docState.current = { pdf: null, numPages: 0, loading: true, error: null }
  })

  it('fires onLoadError once when the document hard-fails to open', () => {
    docState.current = { pdf: null, numPages: 0, loading: false, error: 'Bad PDF' }
    const onLoadError = vi.fn()
    render(<PdfOriginalView {...baseProps} onLoadError={onLoadError} />)
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(onLoadError).toHaveBeenCalledWith('Bad PDF')
  })

  it('does not fire onLoadError while loading / on success', () => {
    docState.current = { pdf: null, numPages: 0, loading: true, error: null }
    const onLoadError = vi.fn()
    render(<PdfOriginalView {...baseProps} onLoadError={onLoadError} />)
    expect(onLoadError).not.toHaveBeenCalled()
  })
})
