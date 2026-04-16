import { useState, useEffect } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useApi } from '../../hooks/useApi'
import { getStorageUrl } from '../../api/client'
import { LocalizedLink } from '../LocalizedLink'
import type { Edition } from '../../types/api'

const BOOK_LIMIT = 12

export function RecommendedSection() {
  const { t } = useTranslation()
  const api = useApi()
  const [books, setBooks] = useState<Edition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getBooks({ limit: BOOK_LIMIT, sort: 'popular' })
      .then((data) => setBooks(data.items))
      .catch((err) => console.error('Failed to load recommended books:', err))
      .finally(() => setLoading(false))
  }, [api])

  if (loading) {
    return (
      <section className="home-recommended">
        <div className="home-recommended__header">
          <h2 className="home-recommended__title">{t('home.recommended.title')}</h2>
        </div>
        <div className="home-recommended__grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="home-recommended__card home-recommended__card--skeleton">
              <div className="home-recommended__cover" />
              <div className="home-recommended__info" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (books.length === 0) return null

  return (
    <section className="home-recommended">
      <div className="home-recommended__header">
        <div>
          <h2 className="home-recommended__title">{t('home.recommended.title')}</h2>
          <p className="home-recommended__subtitle">{t('home.recommended.subtitle')}</p>
        </div>
        <LocalizedLink to="/books?sort=popular" className="home-recommended__view-all" title={t('home.recommended.viewAll')}>
          {t('home.recommended.viewAll')} <span className="material-icons-outlined">arrow_forward</span>
        </LocalizedLink>
      </div>
      <div className="home-recommended__grid">
        {books.map((book) => (
          <LocalizedLink
            key={book.id}
            to={`/books/${book.slug}`}
            className="home-recommended__card"
            title={book.title}
          >
            <div className="home-recommended__cover book-shadow">
              {book.coverPath ? (
                <img
                  src={getStorageUrl(book.coverPath)}
                  alt={book.title}
                  loading="lazy"
                />
              ) : (
                <span className="home-recommended__no-cover">{book.title[0]}</span>
              )}
            </div>
            <div className="home-recommended__info">
              <h3 className="home-recommended__book-title">{book.title}</h3>
              {book.authors.length > 0 && (
                <p className="home-recommended__author">
                  {book.authors.map(a => a.name).join(', ')}
                </p>
              )}
            </div>
          </LocalizedLink>
        ))}
      </div>
    </section>
  )
}
