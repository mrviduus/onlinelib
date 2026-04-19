import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import { getStorageUrl } from '../api/client'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import type { Author } from '../types/api'

const AUTHORS_PER_PAGE = 12

export function AuthorsPage() {
  const { t } = useTranslation()
  const api = useApi()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebounce(searchInput, 300)

  const [authors, setAuthors] = useState<Author[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Update URL when debounced search changes
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (debouncedSearch) next.set('q', debouncedSearch)
      else next.delete('q')
      next.set('page', '1')
      return next
    }, { replace: true })
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.set('page', '1')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setPage = useCallback((p: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('page', String(p))
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Fetch authors
  useEffect(() => {
    setLoading(true)
    api.getAuthors({
      limit: AUTHORS_PER_PAGE,
      offset: (page - 1) * AUTHORS_PER_PAGE,
      sort: (sort as 'name' | 'recent') || undefined,
      search: q || undefined,
    })
      .then((data) => {
        setAuthors(data.items)
        setTotal(data.total)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [api, page, q, sort])

  const totalPages = Math.ceil(total / AUTHORS_PER_PAGE)
  const hasFilters = !!(q || sort)

  return (
    <>
    <div className="authors-page">
      {/*
        Noindex filtered / paginated catalogue views to prevent duplicate meta
        and thin result pages. Only the canonical page 1 is indexable.
      */}
      <SeoHead
        title={t('authors.title')}
        description={t('authors.seoDesc')}
        noindex={page > 1 || hasFilters}
      />
      <h1>{t('authors.title')}</h1>

      {/* Filters */}
      <div className="catalogue-filters">
        <div className="catalogue-filters__search">
          <svg className="catalogue-filters__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="catalogue-filters__input"
            placeholder={t('authors.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className="catalogue-filters__sort"
          value={sort}
          onChange={(e) => setFilter('sort', e.target.value)}
        >
          <option value="">{t('authors.sortName')}</option>
          <option value="recent">{t('authors.sortRecent')}</option>
        </select>
      </div>

      {loading ? (
        <div className="authors-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="author-card author-card--skeleton">
              <div className="author-card__photo" />
              <div className="author-card__name" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="error">Error: {error}</p>
      ) : authors.length === 0 ? (
        <div className="catalogue-empty">
          <p>{q ? t('authors.noResults') : t('authors.noAuthorsYet')}</p>
        </div>
      ) : (
        <>
          <div className="authors-grid">
            {authors.map((author) => (
              <LocalizedLink key={author.id} to={`/authors/${author.slug}`} className="author-card" title={t('authors.viewBio').replace('{name}', author.name)}>
                <div className="author-card__photo">
                  {author.photoPath ? (
                    <img src={getStorageUrl(author.photoPath)} alt={author.name} title={t('authors.bioAndBooks').replace('{name}', author.name)} />
                  ) : (
                    <span className="author-card__initials">{author.name?.[0] || '?'}</span>
                  )}
                </div>
                <h3 className="author-card__name">{author.name}</h3>
                <p className="author-card__count">
                  {author.bookCount} {t('authors.books')}
                </p>
              </LocalizedLink>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="search-page__pagination">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="search-page__pagination-btn"
              >
                {t('books.previous')}
              </button>
              <span className="search-page__pagination-info">
                {t('books.page').replace('{page}', String(page)).replace('{total}', String(totalPages))}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="search-page__pagination-btn"
              >
                {t('books.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
    <Footer />
    </>
  )
}
