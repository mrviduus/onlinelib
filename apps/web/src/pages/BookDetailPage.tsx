import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useLanguage, SupportedLanguage } from '../context/LanguageContext'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import type { BookDetail } from '../types/api'

export function BookDetailPage() {
  const { bookSlug } = useParams<{ bookSlug: string }>()
  const api = useApi()
  const { language } = useLanguage()
  const [book, setBook] = useState<BookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bookSlug) return
    setLoading(true)
    api.getBook(bookSlug)
      .then(setBook)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [bookSlug, api])

  // Compute available languages for hreflang
  const availableLanguages = useMemo<SupportedLanguage[]>(() => {
    if (!book) return []
    const langs = new Set<SupportedLanguage>([language])
    book.otherEditions.forEach((ed) => {
      if (ed.language === 'uk' || ed.language === 'en') {
        langs.add(ed.language)
      }
    })
    return Array.from(langs)
  }, [book, language])

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
        <LocalizedLink to="/books">Back to Books</LocalizedLink>
      </div>
    )
  }

  const firstChapter = book.chapters[0]

  return (
    <div className="book-detail">
      <SeoHead
        title={book.title}
        description={book.description || undefined}
        availableLanguages={availableLanguages}
      />
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
          <p className="book-detail__author">
            {book.authors.length > 0
              ? book.authors.map(a => a.name).join(', ')
              : 'Unknown'}
          </p>
          {book.description && (
            <p className="book-detail__description">{book.description}</p>
          )}
          <p className="book-detail__meta">
            {book.chapters.length} chapters · {book.language.toUpperCase()}
          </p>
          {firstChapter && (
            <LocalizedLink
              to={`/books/${book.slug}/${firstChapter.slug}`}
              className="book-detail__read-btn"
            >
              Start Reading
            </LocalizedLink>
          )}
        </div>
      </div>

      <div className="book-detail__toc">
        <h2>Chapters</h2>
        <ul>
          {book.chapters.map((ch) => (
            <li key={ch.id}>
              <LocalizedLink to={`/books/${book.slug}/${ch.slug}`}>
                <span className="chapter-number">{ch.chapterNumber + 1}.</span>
                <span className="chapter-title">{ch.title}</span>
                {ch.wordCount && (
                  <span className="chapter-words">{ch.wordCount} words</span>
                )}
              </LocalizedLink>
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
                <Link to={`/${ed.language}/books/${ed.slug}`}>
                  {ed.title} ({ed.language.toUpperCase()})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LocalizedLink to="/books" className="book-detail__back">
        Back to Books
      </LocalizedLink>
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
