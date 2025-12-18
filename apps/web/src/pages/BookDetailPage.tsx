import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { BookDetail } from '../types/api'

export function BookDetailPage() {
  const { bookSlug } = useParams<{ bookSlug: string }>()
  const [book, setBook] = useState<BookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bookSlug) return
    api.getBook(bookSlug)
      .then(setBook)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [bookSlug])

  if (loading) {
    return (
      <div className="book-detail">
        <div className="book-detail__skeleton" />
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="book-detail">
        <h1>Error</h1>
        <p>{error || 'Book not found'}</p>
        <Link to="/books">Back to Books</Link>
      </div>
    )
  }

  const firstChapter = book.chapters[0]

  return (
    <div className="book-detail">
      <div className="book-detail__header">
        <div
          className="book-detail__cover"
          style={{ backgroundColor: stringToColor(book.title) }}
        >
          {!book.coverPath && (
            <span className="book-detail__cover-text">{book.title[0]}</span>
          )}
        </div>
        <div className="book-detail__info">
          <h1>{book.title}</h1>
          <p className="book-detail__author">{book.authorsJson || 'Unknown'}</p>
          {book.description && (
            <p className="book-detail__description">{book.description}</p>
          )}
          <p className="book-detail__meta">
            {book.chapters.length} chapters · {book.language.toUpperCase()}
          </p>
          {firstChapter && (
            <Link
              to={`/books/${book.slug}/${firstChapter.slug}`}
              className="book-detail__read-btn"
            >
              Start Reading
            </Link>
          )}
        </div>
      </div>

      <div className="book-detail__toc">
        <h2>Chapters</h2>
        <ul>
          {book.chapters.map((ch) => (
            <li key={ch.id}>
              <Link to={`/books/${book.slug}/${ch.slug}`}>
                <span className="chapter-number">{ch.chapterNumber + 1}.</span>
                <span className="chapter-title">{ch.title}</span>
                {ch.wordCount && (
                  <span className="chapter-words">{ch.wordCount} words</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {book.otherEditions.length > 0 && (
        <div className="book-detail__editions">
          <h2>Other Editions</h2>
          <ul>
            {book.otherEditions.map((ed) => (
              <li key={ed.slug}>
                <Link to={`/books/${ed.slug}`}>
                  {ed.title} ({ed.language.toUpperCase()})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link to="/books" className="book-detail__back">
        ← Back to Books
      </Link>
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
