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

const flagState = { v3: true }
vi.mock('../../lib/features', () => ({
  features: {
    get myBooksV3() { return { headerReframe: flagState.v3 } },
  },
}))

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  )
}

describe('Header (myBooksV3 reframe)', () => {
  beforeEach(() => {
    flagState.v3 = true
    authState.isAuthenticated = false
    authState.isLoading = false
  })

  it('flag ON + authenticated: shows Home / Library / Discover / Vocabulary, hides About', () => {
    flagState.v3 = true
    authState.isAuthenticated = true
    renderHeader()
    expect(screen.getByTitle('Home')).toBeInTheDocument()
    expect(screen.getByTitle('Library')).toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('Vocabulary')).toBeInTheDocument()
    expect(screen.queryByTitle('About TextStack')).not.toBeInTheDocument()
  })

  it('flag ON + unauthenticated: hides Home/Library/Vocabulary, keeps Discover + About', () => {
    flagState.v3 = true
    authState.isAuthenticated = false
    renderHeader()
    expect(screen.queryByTitle('Home')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Library')).not.toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('About TextStack')).toBeInTheDocument()
  })

  it('flag OFF: legacy structure (Discover + Vocabulary + About, no Home / Library)', () => {
    flagState.v3 = false
    authState.isAuthenticated = true
    renderHeader()
    expect(screen.queryByTitle('Home')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Library')).not.toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('Vocabulary')).toBeInTheDocument()
    expect(screen.getByTitle('About TextStack')).toBeInTheDocument()
  })

  it('flag ON + authenticated: logo links to /en/library (home fallback until slice 03)', () => {
    flagState.v3 = true
    authState.isAuthenticated = true
    renderHeader()
    const brand = screen.getByTitle('TextStack')
    expect(brand).toHaveAttribute('href', '/en/library')
  })

  it('flag ON + unauthenticated: logo links to /en (marketing root)', () => {
    flagState.v3 = true
    authState.isAuthenticated = false
    renderHeader()
    const brand = screen.getByTitle('TextStack')
    expect(brand).toHaveAttribute('href', '/en')
  })
})
