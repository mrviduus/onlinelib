import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from '../Header'

const authState = { isAuthenticated: false, isLoading: false }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authState,
}))
vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    getLocalizedPath: (p: string) => `/en${p === '/' ? '' : p}`,
    switchLanguage: () => {},
  }),
}))
vi.mock('../../hooks/useScrolled', () => ({ useScrolled: () => false }))
vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false, toggleTheme: () => {} }) }))
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'nav.home': 'Home',
        'nav.library': 'Library',
        'nav.discover': 'Discover',
        'nav.vocabulary': 'Vocabulary',
        'nav.about': 'About',
        'nav.aboutTextStack': 'About TextStack',
        'nav.brandTitle': 'TextStack',
      }
      return map[key] ?? key
    },
  }),
}))
vi.mock('../../hooks/useQuickStats', () => ({ useQuickStats: () => null }))
vi.mock('../DiscoverMenu', () => ({ DiscoverMenu: () => <div data-testid="discover-menu">Discover</div> }))
vi.mock('../auth/LoginButton', () => ({ LoginButton: () => <button>Sign in</button> }))
vi.mock('../auth/UserMenu', () => ({ UserMenu: () => <div data-testid="user-menu" /> }))
vi.mock('../library/UploadButton', () => ({ UploadButton: () => <button>Upload</button> }))
vi.mock('../StreakBadge', () => ({ StreakBadge: () => null }))
vi.mock('../VocabBadgePopup', () => ({ VocabBadgePopup: () => null }))

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isLoading = false
  })

  it('authenticated: shows Home / Library / Discover / Vocabulary, hides About', () => {
    authState.isAuthenticated = true
    renderHeader()
    expect(screen.getByTitle('Home')).toBeInTheDocument()
    expect(screen.getByTitle('Library')).toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('Vocabulary')).toBeInTheDocument()
    expect(screen.queryByTitle('About TextStack')).not.toBeInTheDocument()
  })

  it('unauthenticated: hides Home/Library/Vocabulary, keeps Discover + About', () => {
    authState.isAuthenticated = false
    renderHeader()
    expect(screen.queryByTitle('Home')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Library')).not.toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('About TextStack')).toBeInTheDocument()
  })

  it('authenticated: logo links to /en/library', () => {
    authState.isAuthenticated = true
    renderHeader()
    const brand = screen.getByTitle('TextStack')
    expect(brand).toHaveAttribute('href', '/en/library')
  })

  it('unauthenticated: logo links to /en (marketing root)', () => {
    authState.isAuthenticated = false
    renderHeader()
    const brand = screen.getByTitle('TextStack')
    expect(brand).toHaveAttribute('href', '/en')
  })
})
