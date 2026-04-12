import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { SiteProvider, useSite } from './context/SiteContext'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider, isValidLanguage } from './context/LanguageContext'
import { DownloadProvider } from './context/DownloadContext'
import { GuestLimitsProvider } from './context/GuestLimitsContext'
import { useGuestMigration } from './hooks/useGuestMigration'
import { NativeLanguageProvider } from './context/NativeLanguageContext'
import { HomePage } from './pages/HomePage'
import { ReaderPage } from './pages/ReaderPage'
import { FocusReaderPage } from './pages/FocusReaderPage'
import { BooksPage } from './pages/BooksPage'
import { BookDetailPage } from './pages/BookDetailPage'
import { SearchPage } from './pages/SearchPage'
import { AuthorsPage } from './pages/AuthorsPage'
import { AuthorDetailPage } from './pages/AuthorDetailPage'
import { GenresPage } from './pages/GenresPage'
import { GenreDetailPage } from './pages/GenreDetailPage'
import { AboutPage } from './pages/AboutPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { ContactPage } from './pages/ContactPage'
import { LibraryPage } from './pages/LibraryPage'
import { UserBookDetailPage } from './pages/UserBookDetailPage'
import { StatsPage } from './pages/StatsPage'
import { VocabularyReviewPage } from './pages/VocabularyReviewPage'
import { HighlightReviewPage } from './pages/HighlightReviewPage'
import { WordsPage } from './pages/WordsPage'
import { PracticePage } from './pages/PracticePage'
import { HighlightsPage } from './pages/HighlightsPage'
import { BlogPage } from './pages/BlogPage'
import { BlogPostPage } from './pages/BlogPostPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { Header } from './components/Header'
import { DownloadProgressBar } from './components/DownloadProgressBar'
import { AuthModal } from './components/auth/AuthModal'
import { GuestBanner } from './components/GuestBanner'
import './styles/theme.css'
import './styles/reader.css'
import './styles/books.css'
import './styles/stats.css'
import './styles/vocabulary.css'
import './styles/reviews.css'
import './styles/blog.css'
import './styles/highlights.css'
import './styles/auth.css'
import './styles/profile.css'

function LanguageRoutes() {
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()

  // Validate language parameter
  if (!isValidLanguage(lang)) {
    return <Navigate to="/en" replace />
  }

  // Hide header on reader pages (have their own top bar) — incl. Focus Mode
  const isReaderPage = /^\/[a-z]{2}\/books\/[^/]+\/[^/]+$/.test(location.pathname)
  const isUserBookReaderPage = /^\/[a-z]{2}\/library\/my\/[^/]+\/read\/[^/]+$/.test(location.pathname)
  const isFocusReaderPage =
    /^\/[a-z]{2}\/books\/[^/]+\/focus\/[^/]+$/.test(location.pathname) ||
    /^\/[a-z]{2}\/library\/my\/[^/]+\/focus\/[^/]+$/.test(location.pathname)

  return (
    <LanguageProvider>
      {!isReaderPage && !isUserBookReaderPage && !isFocusReaderPage && (
        <>
          <GuestBanner />
          <Header />
        </>
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/books/:bookSlug" element={<BookDetailPage />} />
        <Route path="/books/:bookSlug/focus/:chapterSlug" element={<FocusReaderPage mode="public" />} />
        <Route path="/books/:bookSlug/:chapterSlug" element={<ReaderPage />} />
        <Route path="/authors" element={<AuthorsPage />} />
        <Route path="/authors/:slug" element={<AuthorDetailPage />} />
        <Route path="/genres" element={<GenresPage />} />
        <Route path="/genres/:slug" element={<GenreDetailPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/words" element={<WordsPage />} />
        <Route path="/words/review" element={<VocabularyReviewPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/highlights" element={<HighlightsPage />} />
        <Route path="/highlights/review" element={<HighlightReviewPage />} />
        {/* Redirects from old URLs */}
        <Route path="/vocabulary" element={<Navigate to="../words" replace />} />
        <Route path="/vocabulary/review" element={<Navigate to="../words/review" replace />} />
        <Route path="/library/my/:id" element={<UserBookDetailPage />} />
        <Route path="/library/my/:id/read/:chapterSlug" element={<ReaderPage mode="userbook" />} />
        <Route path="/library/my/:id/focus/:chapterSlug" element={<FocusReaderPage mode="userbook" />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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

// Redirect non-language-prefixed URLs to language-prefixed versions
function LegacyRedirect() {
  const { site } = useSite()
  const location = useLocation()
  const defaultLang = site?.defaultLanguage || 'en'
  return <Navigate to={`/${defaultLang}${location.pathname}${location.search}`} replace />
}

function GuestMigrationRunner() {
  useGuestMigration()
  return null
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      {/* Redirect legacy URLs without language prefix */}
      <Route path="/books/*" element={<LegacyRedirect />} />
      <Route path="/authors/*" element={<LegacyRedirect />} />
      <Route path="/genres/*" element={<LegacyRedirect />} />
      <Route path="/search" element={<LegacyRedirect />} />
      <Route path="/about" element={<LegacyRedirect />} />
      <Route path="/privacy" element={<LegacyRedirect />} />
      <Route path="/terms" element={<LegacyRedirect />} />
      <Route path="/contact" element={<LegacyRedirect />} />
      <Route path="/library" element={<LegacyRedirect />} />
      <Route path="/stats" element={<LegacyRedirect />} />
      <Route path="/vocabulary" element={<LegacyRedirect />} />
      <Route path="/vocabulary/review" element={<LegacyRedirect />} />
      <Route path="/highlights" element={<LegacyRedirect />} />
      <Route path="/highlights/review" element={<LegacyRedirect />} />
      <Route path="/blog/*" element={<LegacyRedirect />} />
      <Route path="/:lang/*" element={<LanguageRoutes />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <AuthProvider>
          <GuestLimitsProvider>
          <GuestMigrationRunner />
          <NativeLanguageProvider>
          <DownloadProvider>
            <AppRoutes />
            <DownloadProgressBar />
          </DownloadProvider>
          </NativeLanguageProvider>
          </GuestLimitsProvider>
          <AuthModal />
        </AuthProvider>
      </SiteProvider>
    </BrowserRouter>
  )
}

export default App
