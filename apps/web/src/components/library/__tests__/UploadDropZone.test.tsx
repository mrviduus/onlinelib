import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const useAuthMock = vi.fn()
const getStorageQuotaMock = vi.fn()
let isMobileMock = false

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileMock,
}))
vi.mock('../../../api/userBooks', () => ({
  getStorageQuota: () => getStorageQuotaMock(),
}))
vi.mock('../UploadModal', () => ({
  UploadModal: ({ open, initialFile }: { open: boolean; initialFile?: File }) =>
    open ? <div data-testid="modal" data-file={initialFile?.name ?? ''} /> : null,
}))

import { UploadDropZone } from '../UploadDropZone'

describe('UploadDropZone', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    getStorageQuotaMock.mockReset()
    isMobileMock = false
  })
  afterEach(() => cleanup())

  it('renders headline + cta', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getStorageQuotaMock.mockResolvedValue({ usedBytes: 0, limitBytes: 100 * 1024 * 1024, usedPercent: 0 })
    render(<UploadDropZone />)
    expect(screen.getByText('library.empty.uploads.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'library.empty.uploads.cta' })).toBeInTheDocument()
  })

  it('shows shortcut hint on desktop, hides on mobile', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getStorageQuotaMock.mockResolvedValue(null)
    isMobileMock = false
    const { unmount } = render(<UploadDropZone />)
    expect(screen.getByText('library.empty.uploads.shortcut')).toBeInTheDocument()
    unmount()
    isMobileMock = true
    render(<UploadDropZone />)
    expect(screen.queryByText('library.empty.uploads.shortcut')).toBeNull()
  })

  it('disables CTA when unauthenticated', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false })
    render(<UploadDropZone />)
    const btn = screen.getByRole('button', { name: 'library.empty.uploads.cta' })
    expect(btn).toBeDisabled()
    expect(getStorageQuotaMock).not.toHaveBeenCalled()
  })

  it('shows quota subtitle once loaded', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getStorageQuotaMock.mockResolvedValue({ usedBytes: 1024 * 1024, limitBytes: 100 * 1024 * 1024, usedPercent: 1 })
    render(<UploadDropZone />)
    await waitFor(() => {
      expect(screen.getByText(/used/)).toBeInTheDocument()
    })
  })

  it('opens modal with selected valid file', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getStorageQuotaMock.mockResolvedValue(null)
    const { container } = render(<UploadDropZone />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'novel.epub', { type: 'application/epub+zip' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    const modal = screen.getByTestId('modal')
    expect(modal).toBeInTheDocument()
    expect(modal.getAttribute('data-file')).toBe('novel.epub')
  })

  it('rejects invalid file (no modal opens)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true })
    getStorageQuotaMock.mockResolvedValue(null)
    const { container } = render(<UploadDropZone />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'image.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    expect(screen.queryByTestId('modal')).toBeNull()
  })
})
