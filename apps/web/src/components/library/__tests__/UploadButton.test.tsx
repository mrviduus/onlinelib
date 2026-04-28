import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const useAuthMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))
vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ getLocalizedPath: (p: string) => `/en${p}` }),
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))
vi.mock('../UploadModal', () => ({
  UploadModal: ({ open }: { open: boolean }) => (open ? <div data-testid="modal" /> : null),
}))
vi.mock('../../../lib/features', () => ({
  features: { myBooksV3: { addMenu: false } },
}))

import { UploadButton } from '../UploadButton'

describe('UploadButton', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  it('renders nothing while auth is loading', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true })
    const { container } = render(<UploadButton />)
    expect(container.firstChild).toBeNull()
  })

  it('renders sign-in CTA for unauthenticated users', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false })
    render(<UploadButton />)
    const btn = screen.getByRole('button', { name: 'upload.modal.signin' })
    fireEvent.click(btn)
    expect(navigateMock).toHaveBeenCalledWith('/en/login?next=/library')
  })

  it('renders upload button + opens modal for authenticated user', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false })
    render(<UploadButton />)
    const btn = screen.getByRole('button', { name: 'upload.button' })
    expect(screen.queryByTestId('modal')).toBeNull()
    fireEvent.click(btn)
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })
})
