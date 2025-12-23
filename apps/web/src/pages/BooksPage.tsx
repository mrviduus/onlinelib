import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { LocalizedLink } from '../components/LocalizedLink'
import type { Edition } from '../types/api'

export function BooksPage() {
  const api = useApi()
  const [books, setBooks] = useState<Edition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getBooks()
      .then((data) => setBooks(data.items ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [api])

  if (loading) {
    return (
      <div className="books-page">
        <h1>Books</h1>
        <div className="books-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="book-card book-card--skeleton">
              <div className="book-card__cover" />
              <div className="book-card__title" />
              <div className="book-card__author" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="books-page">
        <h1>Books</h1>
        <p className="error">Error: {error}</p>
      </div>
    )
  }

  return (
    <div className="books-page">
      <h1>Books</h1>
      {books.length === 0 ? (
        <p>No books available yet.</p>
      ) : (
        <div className="books-grid">
          {books.map((book) => (
            <LocalizedLink key={book.id} to={`/books/${book.slug}`} className="book-card">
              <div
                className="book-card__cover"
                style={{ backgroundColor: stringToColor(book.title) }}
              >
                {!book.coverPath && (
                  <span className="book-card__cover-text">{book.title[0]}</span>
                )}
              </div>
              <h3 className="book-card__title">{book.title}</h3>
              <p className="book-card__author">{book.authorsJson || 'Unknown'}</p>
              <p className="book-card__meta">{book.chapterCount} chapters</p>
            </LocalizedLink>
          ))}
        </div>
      )}
    </div>
  )
}

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = hash % 360
  return `hsl(${hue}, 40%, 80%)`
}
