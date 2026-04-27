import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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

import { UploadModal } from '../UploadModal'

describe('UploadModal', () => {
  beforeEach(() => navigateMock.mockReset())
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

  it('on upload complete navigates to library w/ highlight + closes', () => {
    const onClose = vi.fn()
    render(<UploadModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('fake-upload'))
    expect(onClose).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/en/library?tab=uploads&highlight=book-42')
  })
})
