import { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { getStorageUrl } from '../../api/client'
import { useTranslation } from '../../hooks/useTranslation'
import { LocalizedLink } from '../LocalizedLink'
import { stringToColor } from '../../utils/colors'
import type { SimilarBook } from '../../types/api'

interface SimilarBooksRailProps {
  slug: string
}

/**
 * "Similar books" rail (AI-056). Fetches embedding-similar published editions
 * for the given book slug and renders a book-card rail mirroring the existing
 * "more by author" section. Renders nothing on empty/error — a book with no
 * embedding yet (NULL until AI-054 backfill runs) simply shows no rail.
 */
export function SimilarBooksRail({ slug }: SimilarBooksRailProps) {
  const api = useApi()
  const { t } = useTranslation()
  const [books, setBooks] = useState<SimilarBook[]>([])

  useEffect(() => {
    let cancelled = false
    api.getSimilarBooks(slug)
      .then((data) => { if (!cancelled) setBooks(data) })
      .catch(() => { if (!cancelled) setBooks([]) }) // graceful: hide rail on error
    return () => { cancelled = true }
  }, [slug, api])

  if (books.length === 0) return null

  return (
    <section className="book-more-by-author" aria-label={t('bookDetail.similarBooks')}>
      <h2>{t('bookDetail.similarBooks')}</h2>
      <div className="book-more-by-author__grid">
        {books.map((b) => (
          <LocalizedLink key={b.slug} to={`/books/${b.slug}`} className="book-more-by-author__card">
            <div
              className="book-more-by-author__cover"
              style={{ backgroundColor: b.coverPath ? undefined : stringToColor(b.title) }}
            >
              {b.coverPath ? (
                <img src={getStorageUrl(b.coverPath)} alt={b.title} loading="lazy" />
              ) : (
                <span className="book-more-by-author__cover-text">{b.title?.[0] || '?'}</span>
              )}
            </div>
            <span className="book-more-by-author__title">{b.title}</span>
          </LocalizedLink>
        ))}
      </div>
    </section>
  )
}
