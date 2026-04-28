import { describe, it, expect, vi } from 'vitest'
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
vi.mock('../ProfileModal', () => ({ ProfileModal: () => null }))

function open() {
  render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button', { name: /Test User/i }))
}

describe('UserMenu', () => {
  it('drops legacy items: My Library / Highlights / Vocabulary / My language', () => {
    open()
    expect(screen.queryByText('My Library')).not.toBeInTheDocument()
    expect(screen.queryByText('Highlights')).not.toBeInTheDocument()
    expect(screen.queryByText('Vocabulary')).not.toBeInTheDocument()
    expect(screen.queryByText('My language')).not.toBeInTheDocument()
  })

  it('keeps Edit profile + Sign out', () => {
    open()
    expect(screen.getByText('Edit profile')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })
})
