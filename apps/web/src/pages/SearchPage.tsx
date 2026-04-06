import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import { getStorageUrl } from '../api/client'
import { useTranslation } from '../hooks/useTranslation'
import { LocalizedLink } from '../components/LocalizedLink'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { EmptyState } from '../components/EmptyState'
import type { SearchResult } from '../types/api'
import { sanitizeHtml } from '../utils/sanitize'
import {
  groupByEdition,
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  type GroupedEdition,
} from '../utils/searchUtils'

const EDITIONS_PER_PAGE = 10

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const api = useApi()
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [inputValue, setInputValue] = useState(query)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [expandedEditions, setExpandedEditions] = useState<Set<string>>(new Set())
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches)

  const debouncedInput = useDebounce(inputValue.trim(), 300)

  // Sync debounced input → URL param
  useEffect(() => {
    const current = searchParams.get('q') || ''
    if (debouncedInput !== current) {
      if (debouncedInput) {
        setSearchParams({ q: debouncedInput }, { replace: true })
      } else {
        setSearchParams({}, { replace: true })
      }
    }
  }, [debouncedInput, searchParams, setSearchParams])

  // Sync URL param → input (e.g. browser back/forward)
  useEffect(() => {
    setInputValue(query)
  }, [query])

  // Fetch results when query changes
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setError(null)
    setPage(1)
    setExpandedEditions(new Set())

    api.search(query, { limit: 100, offset: 0, highlight: true })
      .then((data) => {
        setResults(data.items)
        addRecentSearch(query)
        setRecentSearches(getRecentSearches())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [api, query])

  // Auto-focus when no query
  useEffect(() => {
    if (!query) inputRef.current?.focus()
  }, [query])

  const grouped = groupByEdition(results)
  const totalPages = Math.ceil(grouped.length / EDITIONS_PER_PAGE)
  const pagedEditions = grouped.slice((page - 1) * EDITIONS_PER_PAGE, page * EDITIONS_PER_PAGE)

  const toggleExpanded = (editionId: string) => {
    setExpandedEditions(prev => {
      const next = new Set(prev)
      if (next.has(editionId)) next.delete(editionId)
      else next.add(editionId)
      return next
    })
  }

  const buildChapterUrl = (slug: string, result: SearchResult) => {
    const chapterPart = result.chapterSlug || String(result.chapterNumber)
    return `/books/${slug}/${chapterPart}`
  }

  const renderHighlight = (html: string) => (
    <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  )

  const handleRecentClick = (q: string) => {
    setInputValue(q)
  }

  const handleRemoveRecent = (e: React.MouseEvent, q: string) => {
    e.stopPropagation()
    removeRecentSearch(q)
    setRecentSearches(getRecentSearches())
  }

  const handleClearAll = () => {
    clearRecentSearches()
    setRecentSearches([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = inputValue.trim()
      if (trimmed) {
        setSearchParams({ q: trimmed }, { replace: true })
      }
    }
  }

  const renderEditionCard = (group: GroupedEdition) => {
    const { edition, bestMatch, otherMatches } = group
    const isExpanded = expandedEditions.has(edition.id)

    return (
      <div key={edition.id} className="search-page__edition-group">
        <LocalizedLink
          to={buildChapterUrl(edition.slug, bestMatch)}
          className="search-page__result"
          title={t('search.readOnline').replace('{title}', edition.title)}
        >
          <div
            className="search-page__result-cover"
            style={{ backgroundColor: edition.coverPath ? undefined : '#e0e0e0' }}
          >
            {edition.coverPath ? (
              <img src={getStorageUrl(edition.coverPath)} alt={edition.title} title={t('search.readOnlineFree').replace('{title}', edition.title)} />
            ) : (
              <span>{edition.title?.[0] || '?'}</span>
            )}
          </div>
          <div className="search-page__result-info">
            <h3 className="search-page__result-title">{edition.title}</h3>
            <p className="search-page__result-chapter">
              {bestMatch.chapterTitle || `${t('search.chapter')} ${bestMatch.chapterNumber}`}
            </p>
            {edition.authors && (
              <p className="search-page__result-author">{edition.authors}</p>
            )}
            {bestMatch.highlights && bestMatch.highlights.length > 0 && (
              <div className="search-page__result-highlights">
                {bestMatch.highlights.slice(0, 2).map((highlight, i) => (
                  <p key={i} className="search-page__result-highlight">
                    {renderHighlight(highlight)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </LocalizedLink>

        {otherMatches.length > 0 && (
          <>
            <button
              className="search-page__more-toggle"
              onClick={() => toggleExpanded(edition.id)}
            >
              {isExpanded
                ? t('search.hideChapters')
                : t('search.moreChapters').replace('{count}', String(otherMatches.length))}
            </button>

            {isExpanded && (
              <div className="search-page__sub-results">
                {otherMatches.map((match) => (
                  <LocalizedLink
                    key={match.chapterId}
                    to={buildChapterUrl(edition.slug, match)}
                    className="search-page__sub-result"
                  >
                    <span className="search-page__sub-result-title">
                      {match.chapterTitle || `${t('search.chapter')} ${match.chapterNumber}`}
                    </span>
                    {match.highlights && match.highlights.length > 0 && (
                      <span className="search-page__sub-result-highlight">
                        {renderHighlight(match.highlights[0])}
                      </span>
                    )}
                  </LocalizedLink>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="search-page">
        <SeoHead title={query ? `${t('search.title')}: ${query}` : t('search.title')} noindex />
        <h1>{query ? `${t('search.title')}: "${query}"` : t('search.title')}</h1>

        <div className="search-page__input-wrapper">
          <svg className="search-page__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="search-page__input"
            placeholder={t('search.searchPlaceholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span className="search-page__spinner" />}
        </div>

        {!query && recentSearches.length > 0 && (
          <div className="search-page__recent">
            <div className="search-page__recent-header">
              <span>{t('search.recentSearches')}</span>
              <button className="search-page__recent-clear" onClick={handleClearAll}>
                {t('search.clearAll')}
              </button>
            </div>
            <ul className="search-page__recent-list">
              {recentSearches.map((q) => (
                <li key={q} className="search-page__recent-item" onClick={() => handleRecentClick(q)}>
                  <svg className="search-page__recent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{q}</span>
                  <button
                    className="search-page__recent-remove"
                    onClick={(e) => handleRemoveRecent(e, q)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!query && recentSearches.length === 0 && (
          <EmptyState icon="🔍" title={t('search.enterQuery')} />
        )}

        {query && loading && (
          <div className="search-page__results">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="search-page__result search-page__result--skeleton">
                <div className="search-page__result-cover" />
                <div className="search-page__result-info">
                  <div className="search-page__result-title" />
                  <div className="search-page__result-author" />
                </div>
              </div>
            ))}
          </div>
        )}

        {query && !loading && error && (
          <p className="error">Error: {error}</p>
        )}

        {query && !loading && !error && results.length === 0 && (
          <EmptyState icon="📭" title={t('search.noResults')} />
        )}

        {query && !loading && !error && grouped.length > 0 && (
          <>
            <p className="search-page__count">
              {t('search.foundEditions').replace('{total}', String(grouped.length))}
            </p>

            <div className="search-page__results">
              {pagedEditions.map(renderEditionCard)}
            </div>

            {totalPages > 1 && (
              <div className="search-page__pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="search-page__pagination-btn"
                >
                  {t('search.previous')}
                </button>
                <span className="search-page__pagination-info">
                  {t('search.page').replace('{page}', String(page)).replace('{total}', String(totalPages))}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="search-page__pagination-btn"
                >
                  {t('search.next')}
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
