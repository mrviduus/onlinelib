import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { useLanguage } from '../context/LanguageContext'
import type { GenreDetail } from '../types/api'

export function GenreDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { language } = useLanguage()
  const api = useApi()
  const [genre, setGenre] = useState<GenreDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    api.getGenre(slug)
      .then((data) => setGenre(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [api, slug])

  if (loading) {
    return (
      <div className="genre-detail">
        <div className="genre-detail__header genre-detail__header--skeleton">
          <div className="genre-detail__name" />
          <div className="genre-detail__description" />
        </div>
      </div>
    )
  }

  if (error || !genre) {
    return (
      <div className="genre-detail">
        <h1>{language === 'uk' ? 'Жанр не знайдений' : 'Genre not found'}</h1>
        <p className="error">{error || 'Not found'}</p>
      </div>
    )
  }

  const seoTitle = language === 'uk'
    ? `${genre.name} — книги онлайн`
    : `${genre.name} — books online`
  const seoDescription = genre.description || (language === 'uk'
    ? `Читайте книги жанру ${genre.name} онлайн`
    : `Read ${genre.name} books online`)

  return (
    <div className="genre-detail">
      <SeoHead title={seoTitle} description={seoDescription} />

      <div className="genre-detail__header">
        <h1 className="genre-detail__name">{genre.name}</h1>
        {genre.description && <p className="genre-detail__description">{genre.description}</p>}
        <p className="genre-detail__count">
          {genre.bookCount} {language === 'uk' ? 'книг' : 'books'}
        </p>
      </div>

      <h2>{language === 'uk' ? 'Книги' : 'Books'}</h2>
      {genre.editions.length === 0 ? (
        <p>{language === 'uk' ? 'Книг поки немає.' : 'No books available.'}</p>
      ) : (
        <div className="books-grid">
          {genre.editions.map((book) => (
            <LocalizedLink key={book.id} to={`/books/${book.slug}`} className="book-card">
              <div className="book-card__cover" style={{ backgroundColor: '#e0e0e0' }}>
                {book.coverPath ? (
                  <img src={book.coverPath} alt="" />
                ) : (
                  <span className="book-card__cover-text">{book.title[0]}</span>
                )}
              </div>
              <h3 className="book-card__title">{book.title}</h3>
            </LocalizedLink>
          ))}
        </div>
      )}
    </div>
  )
}
