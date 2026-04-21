import { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { getStorageUrl } from '../api/client'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { Footer } from '../components/Footer'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { isNotFoundError } from '../lib/errorUtils'
import type { GenreDetail, Genre } from '../types/api'

const RELATED_AUTHORS_LIMIT = 12
const RELATED_GENRES_LIMIT = 10

export function GenreDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const api = useApi()
  const [genre, setGenre] = useState<GenreDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [otherGenres, setOtherGenres] = useState<Genre[]>([])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    api.getGenre(slug)
      .then((data) => { if (!cancelled) setGenre(data) })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, slug])

  // Fetch sibling genres once — used to populate the "Explore more genres" hub
  useEffect(() => {
    let cancelled = false
    api.getGenres({ language })
      .then((data) => { if (!cancelled) setOtherGenres(data.items) })
      .catch(() => { /* Non-critical — silently drop */ })
    return () => { cancelled = true }
  }, [api, language])

  // Aggregate popular authors from this genre's editions
  const popularAuthors = useMemo(() => {
    if (!genre?.editions?.length) return []
    const counts = new Map<string, { slug: string; name: string; count: number }>()
    for (const ed of genre.editions) {
      for (const a of ed.authors || []) {
        const existing = counts.get(a.slug)
        if (existing) {
          existing.count += 1
        } else {
          counts.set(a.slug, { slug: a.slug, name: a.name, count: 1 })
        }
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, RELATED_AUTHORS_LIMIT)
  }, [genre])

  const relatedGenres = useMemo(() => {
    if (!genre || !otherGenres.length) return []
    return otherGenres
      .filter((g) => g.slug !== genre.slug && g.bookCount > 0)
      .sort((a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name))
      .slice(0, RELATED_GENRES_LIMIT)
  }, [genre, otherGenres])

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

  if (isNotFoundError(error) || (!genre && !error)) {
    return (
      <div className="genre-detail">
        <SeoHead
          title="Genre Not Found"
          description="This genre doesn't exist or has no published books."
          noindex
          statusCode={404}
        />
        <h1>Genre not found</h1>
        <p className="error">{error?.message || 'Not found'}</p>
        <LocalizedLink to="/" className="back-home-link">
          Back to Home
        </LocalizedLink>
      </div>
    )
  }

  if (error) {
    return (
      <div className="genre-detail">
        <SeoHead title="Error" />
        <h1>Loading error</h1>
        <p className="error">{error.message}</p>
        <LocalizedLink to="/" className="back-home-link">
          Back to Home
        </LocalizedLink>
      </div>
    )
  }

  if (!genre) return null

  const seoTitle = `${genre.name} — books online`
  const seoDescription = genre.description || `Read ${genre.name} books online`

  return (
    <>
    <div className="genre-detail">
      <SeoHead title={seoTitle} description={seoDescription} />

      {/* Breadcrumbs: Home → Genres → Genre Name */}
      <Breadcrumbs
        items={[
          { label: t('breadcrumbs.genres'), to: '/genres' },
          { label: genre.name },
        ]}
      />

      <div className="genre-detail__header">
        <h1 className="genre-detail__name">{genre.name}</h1>
        {genre.description && <p className="genre-detail__description">{genre.description}</p>}
        <p className="genre-detail__count">
          {genre.bookCount} books
        </p>
      </div>

      <h2>Books</h2>
      {genre.editions.length === 0 ? (
        <p>No books available.</p>
      ) : (
        <div className="books-grid">
          {genre.editions.map((book) => (
            <LocalizedLink key={book.id} to={`/books/${book.slug}`} className="book-card" title={`Read ${book.title} online`}>
              <div className="book-card__cover" style={{ backgroundColor: book.coverPath ? undefined : '#e0e0e0' }}>
                {book.coverPath ? (
                  <img src={getStorageUrl(book.coverPath)} alt={book.title} title={`${book.title} - Read online free`} />
                ) : (
                  <span className="book-card__cover-text">{book.title?.[0] || '?'}</span>
                )}
              </div>
              <h3 className="book-card__title">{book.title}</h3>
            </LocalizedLink>
          ))}
        </div>
      )}

      {popularAuthors.length > 0 && (
        <section className="genre-related" aria-labelledby="genre-related-authors">
          <h2 id="genre-related-authors">
            {`Popular authors in ${genre.name}`}
          </h2>
          <ul className="genre-related__authors">
            {popularAuthors.map((a) => (
              <li key={a.slug}>
                <LocalizedLink to={`/authors/${a.slug}`} className="genre-related__author">
                  <span className="genre-related__author-name">{a.name}</span>
                  <span className="genre-related__author-count">
                    {a.count} {a.count === 1 ? 'book' : 'books'}
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatedGenres.length > 0 && (
        <section className="genre-related" aria-labelledby="genre-related-genres">
          <h2 id="genre-related-genres">
            Explore more genres
          </h2>
          <ul className="genre-related__genres">
            {relatedGenres.map((g) => (
              <li key={g.slug}>
                <LocalizedLink to={`/genres/${g.slug}`} className="genre-related__chip">
                  {g.name}
                  <span className="genre-related__chip-count"> · {g.bookCount}</span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    <Footer />
    </>
  )
}
