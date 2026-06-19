import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DeviceVerifyPage } from './DeviceVerifyPage'

// Real useTranslation reads en.json; only the language source needs stubbing.
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}))

// Signed-in consent state so the title (which differs by audience) renders.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { email: 'user@example.com' },
    openAuthModal: vi.fn(),
  }),
}))

function renderPage(ui: React.ReactElement, code = 'ABCD-1234') {
  return render(<MemoryRouter initialEntries={[`/?code=${code}`]}>{ui}</MemoryRouter>)
}

describe('DeviceVerifyPage', () => {
  it('renders CLI copy by default', () => {
    renderPage(<DeviceVerifyPage />)
    expect(screen.getByText('Approve connection')).toBeInTheDocument()
  })

  it('renders extension copy when audience="extension"', () => {
    renderPage(<DeviceVerifyPage audience="extension" />)
    expect(screen.getByText('Connect the browser extension')).toBeInTheDocument()
  })
})
