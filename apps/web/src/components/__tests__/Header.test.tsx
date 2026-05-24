import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
        'nav.search': 'Search',
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
// MobileSearchOverlay pulls in api hooks + IndexedDB-touching code we don't
// need to exercise here — assert visibility via a marker div.
vi.mock('../Search', () => ({
  MobileSearchOverlay: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="search-overlay">
      <button onClick={onClose}>Close search</button>
    </div>
  ),
}))

function renderHeader(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Header />
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isLoading = false
  })

  it('authenticated: shows Library / Discover / Vocabulary, hides Home + About', () => {
    authState.isAuthenticated = true
    renderHeader()
    expect(screen.queryByTitle('Home')).not.toBeInTheDocument()
    expect(screen.getByTitle('Library')).toBeInTheDocument()
    expect(screen.getByTestId('discover-menu')).toBeInTheDocument()
    expect(screen.getByTitle('Vocabulary')).toBeInTheDocument()
    expect(screen.queryByTitle('About TextStack')).not.toBeInTheDocument()
  })

  it('unauthenticated: hides Library/Vocabulary, keeps Discover + About', () => {
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

  // Search icon was removed in 3e53e3e ("clean header") on the assumption that
  // the hero search on home was enough. It wasn't — on every other page the
  // hero is gone and users had nowhere to launch a search from. These tests
  // pin the new behavior: visible on non-home routes, hidden on home + on /uk
  // home (and bare home for unauth marketing root).

  it('search icon hidden on home (hero already has search)', () => {
    renderHeader('/')
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('search icon hidden on /en home', () => {
    renderHeader('/en')
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('search icon hidden on /en/ trailing-slash home', () => {
    renderHeader('/en/')
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('search icon hidden on /uk home (multilingual root)', () => {
    renderHeader('/uk')
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('search icon visible on /en/library', () => {
    renderHeader('/en/library')
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('search icon visible on /en/discover', () => {
    renderHeader('/en/discover')
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('search icon visible on /en/vocabulary', () => {
    renderHeader('/en/vocabulary')
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('search icon visible on a reader route /en/books/foo', () => {
    renderHeader('/en/books/foo')
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('clicking search icon opens overlay', () => {
    renderHeader('/en/library')
    expect(screen.queryByTestId('search-overlay')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Search'))
    expect(screen.getByTestId('search-overlay')).toBeInTheDocument()
  })

  it('overlay close button removes the overlay', () => {
    renderHeader('/en/library')
    fireEvent.click(screen.getByLabelText('Search'))
    expect(screen.getByTestId('search-overlay')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Close search'))
    expect(screen.queryByTestId('search-overlay')).not.toBeInTheDocument()
  })
})
