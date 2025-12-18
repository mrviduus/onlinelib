import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { ReaderPage } from './pages/ReaderPage'
import { BooksPage } from './pages/BooksPage'
import { BookDetailPage } from './pages/BookDetailPage'
import './styles/reader.css'
import './styles/books.css'

function Home() {
  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1>OnlineLib</h1>
      <p>Free online library with a beautiful reading experience.</p>
      <Link to="/books" style={{
        display: 'inline-block',
        background: '#1a1a1a',
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/books/:bookSlug" element={<BookDetailPage />} />
        <Route path="/books/:bookSlug/:chapterSlug" element={<ReaderPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
