import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { SiteProvider, useSite } from './context/SiteContext'
import { LanguageProvider, isValidLanguage } from './context/LanguageContext'
import { getSiteTheme } from './config/sites'
import { ReaderPage } from './pages/ReaderPage'
import { BooksPage } from './pages/BooksPage'
import { BookDetailPage } from './pages/BookDetailPage'
import { SearchPage } from './pages/SearchPage'
import { AuthorsPage } from './pages/AuthorsPage'
import { AuthorDetailPage } from './pages/AuthorDetailPage'
import { GenresPage } from './pages/GenresPage'
import { GenreDetailPage } from './pages/GenreDetailPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LocalizedLink } from './components/LocalizedLink'
import { Header } from './components/Header'
import './styles/reader.css'
import './styles/books.css'

function Home() {
  const { site, loading } = useSite()
  const theme = getSiteTheme(site?.siteCode || 'default')

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>
  }

  return (
    <div style={{
      padding: 24,
      maxWidth: 600,
      margin: '0 auto',
      backgroundColor: theme.colors.background,
    }}>
      <h1 style={{ color: theme.colors.primary, marginTop: 0 }}>{theme.name}</h1>
      <p style={{ color: theme.colors.text }}>{theme.tagline}</p>
      <LocalizedLink to="/books" style={{
        display: 'inline-block',
        background: theme.colors.primary,
        color: '#fff',
        padding: '12px 24px',
        borderRadius: 8,
        textDecoration: 'none',
        marginTop: 16
      }}>
        Browse Books
      </LocalizedLink>
    </div>
  )
}

function LanguageRoutes() {
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()

  // Validate language parameter
  if (!isValidLanguage(lang)) {
    return <Navigate to="/en" replace />
  }

  // Hide header on reader page (has its own top bar)
  const isReaderPage = /^\/[a-z]{2}\/books\/[^/]+\/[^/]+$/.test(location.pathname)

  return (
    <LanguageProvider>
      {!isReaderPage && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/books/:bookSlug" element={<BookDetailPage />} />
        <Route path="/books/:bookSlug/:chapterSlug" element={<ReaderPage />} />
        <Route path="/authors" element={<AuthorsPage />} />
        <Route path="/authors/:slug" element={<AuthorDetailPage />} />
        <Route path="/genres" element={<GenresPage />} />
        <Route path="/genres/:slug" element={<GenreDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </LanguageProvider>
  )
}

function RootRedirect() {
  const { site } = useSite()
  const defaultLang = site?.defaultLanguage || 'en'
  return <Navigate to={`/${defaultLang}`} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/:lang/*" element={<LanguageRoutes />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <AppRoutes />
      </SiteProvider>
    </BrowserRouter>
  )
}

export default App
