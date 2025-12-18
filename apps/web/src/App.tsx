import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { SiteProvider, useSite } from './context/SiteContext'
import { getSiteTheme } from './config/sites'
import { ReaderPage } from './pages/ReaderPage'
import { BooksPage } from './pages/BooksPage'
import { BookDetailPage } from './pages/BookDetailPage'
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
      minHeight: '100vh'
    }}>
      <img
        src={theme.logo}
        alt={theme.name}
        style={{ height: 50, marginBottom: 16 }}
      />
      <h1 style={{ color: theme.colors.primary, marginTop: 0 }}>{theme.name}</h1>
      <p style={{ color: theme.colors.text }}>{theme.tagline}</p>
      <Link to="/books" style={{
        display: 'inline-block',
        background: theme.colors.primary,
        color: '#fff',
        padding: '12px 24px',
        borderRadius: 8,
        textDecoration: 'none',
        marginTop: 16
      }}>
        Browse Books
      </Link>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/books" element={<BooksPage />} />
      <Route path="/books/:bookSlug" element={<BookDetailPage />} />
      <Route path="/books/:bookSlug/:chapterSlug" element={<ReaderPage />} />
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
