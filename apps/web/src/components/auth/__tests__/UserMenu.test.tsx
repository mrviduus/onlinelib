import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UserMenu } from '../UserMenu'

const authUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Test User',
  picture: null,
  isGuest: false,
  nativeLanguage: 'en',
}

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: () => {} }),
}))
vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    getLocalizedPath: (p: string) => `/en${p}`,
    switchLanguage: () => {},
  }),
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('../../../hooks/useOnline', () => ({ useOnline: () => true }))
vi.mock('@textstack/shared', () => ({ getAnonymousReader: () => null }))
vi.mock('../../../lib/userInitials', () => ({ getUserInitials: () => 'TU' }))
vi.mock('../../../data/languages', () => ({
  getLanguage: () => ({ code: 'en', englishName: 'English' }),
  getFlagUrl: () => '/flag-en.svg',
}))
vi.mock('../ProfileModal', () => ({ ProfileModal: () => null }))

const flagState = { v3: true }
vi.mock('../../../lib/features', () => ({
  features: {
    get myBooksV3() { return { headerReframe: flagState.v3 } },
  },
}))

function open() {
  render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button', { name: /Test User/i }))
}

describe('UserMenu (myBooksV3)', () => {
  beforeEach(() => { flagState.v3 = true })

  it('flag ON: dropdown drops My Library / Highlights / Vocabulary / My language', () => {
    flagState.v3 = true
    open()
    expect(screen.queryByText('My Library')).not.toBeInTheDocument()
    expect(screen.queryByText('Highlights')).not.toBeInTheDocument()
    expect(screen.queryByText('Vocabulary')).not.toBeInTheDocument()
    expect(screen.queryByText('My language')).not.toBeInTheDocument()
  })

  it('flag ON: keeps Edit profile + Sign out', () => {
    flagState.v3 = true
    open()
    expect(screen.getByText('Edit profile')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('flag OFF: legacy items still present', () => {
    flagState.v3 = false
    open()
    expect(screen.getByText('My Library')).toBeInTheDocument()
    expect(screen.getByText('Highlights')).toBeInTheDocument()
    expect(screen.getByText('Vocabulary')).toBeInTheDocument()
    expect(screen.getByText('My language')).toBeInTheDocument()
  })
})
