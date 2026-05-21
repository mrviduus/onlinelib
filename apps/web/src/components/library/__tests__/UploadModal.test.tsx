import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const navigateMock = vi.fn()

vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ getLocalizedPath: (p: string) => `/en${p}` }),
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))
vi.mock('../UploadForm', () => ({
  UploadForm: ({ onUploadComplete }: { onUploadComplete: (id?: string) => void }) => (
    <button data-testid="fake-upload" onClick={() => onUploadComplete('book-42')}>upload</button>
  ),
}))
// getUserBook is polled after upload — keep it pending so the modal stays in
// the Processing phase (no auto-transition during these tests).
const getUserBookMock = vi.fn(() => new Promise(() => {}))
vi.mock('../../../api/userBooks', () => ({
  getUserBook: (...args: unknown[]) => getUserBookMock(...args),
}))

import { UploadModal } from '../UploadModal'

describe('UploadModal', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    getUserBookMock.mockReset()
    getUserBookMock.mockImplementation(() => new Promise(() => {}))
  })
  afterEach(() => cleanup())

  it('returns null when closed', () => {
    const { container } = render(<UploadModal open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog + title when open', () => {
    render(<UploadModal open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('upload.modal.title')).toBeInTheDocument()
  })

  it('Esc key calls onClose', () => {
    const onClose = vi.fn()
    render(<UploadModal open={true} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('backdrop click calls onClose; modal click does not', () => {
    const onClose = vi.fn()
    render(<UploadModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('after upload the modal stays open and shows the processing state', () => {
    const onClose = vi.fn()
    render(<UploadModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('fake-upload'))
    // No close, no navigate — user sees the post-upload status UI.
    expect(onClose).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByText('upload.status.processing')).toBeInTheDocument()
  })

  it('failed phase shows server errorMessage when present', async () => {
    getUserBookMock.mockResolvedValueOnce({
      id: 'book-42', title: 't', slug: 't', language: 'en', status: 'Failed',
      errorMessage: 'Could not read this file. It may be corrupted or password-protected.',
      chapters: [], createdAt: '', updatedAt: '',
    })
    vi.useFakeTimers()
    render(<UploadModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('fake-upload'))
    await vi.advanceTimersByTimeAsync(2100)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText('upload.status.failedTitle')).toBeInTheDocument())
    expect(screen.getByText(/Could not read this file/)).toBeInTheDocument()
  })

  it('failed phase falls back to generic message when errorMessage is empty', async () => {
    getUserBookMock.mockResolvedValueOnce({
      id: 'book-42', title: 't', slug: 't', language: 'en', status: 'Failed',
      errorMessage: '   ', chapters: [], createdAt: '', updatedAt: '',
    })
    vi.useFakeTimers()
    render(<UploadModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('fake-upload'))
    await vi.advanceTimersByTimeAsync(2100)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText('upload.status.failed')).toBeInTheDocument())
  })

  it('after upload broadcasts user-books + shelves changes so consumers refetch', () => {
    const userBooks = vi.fn()
    const shelves = vi.fn()
    window.addEventListener('textstack:data:user-books', userBooks)
    window.addEventListener('textstack:data:shelves', shelves)
    render(<UploadModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('fake-upload'))
    expect(userBooks).toHaveBeenCalled()
    expect(shelves).toHaveBeenCalled()
    window.removeEventListener('textstack:data:user-books', userBooks)
    window.removeEventListener('textstack:data:shelves', shelves)
  })
})
