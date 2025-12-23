import { useState, useEffect, useRef, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import { LocalizedLink } from './LocalizedLink'
import type { Edition } from '../types/api'

interface SearchResult extends Edition {}

export function Search() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const api = useApi()
  const { language } = useLanguage()

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    api.search(debouncedQuery, { limit: 8 })
      .then((data) => {
        if (cancelled) return
        setResults(data.results as SearchResult[])
        setIsOpen(true)
        setActiveIndex(-1)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [debouncedQuery, api])

  // Click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => (i < results.length - 1 ? i + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => (i > 0 ? i - 1 : results.length - 1))
        break
      case 'Enter':
        if (activeIndex >= 0 && results[activeIndex]) {
          e.preventDefault()
          window.location.href = `/${language}/books/${results[activeIndex].slug}`
        }
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }, [isOpen, results, activeIndex, language])

  const handleResultClick = () => {
    setQuery('')
    setIsOpen(false)
  }

  const parseAuthors = (json: string | null): string => {
    if (!json) return ''
    try {
      const authors = JSON.parse(json)
      return Array.isArray(authors) ? authors.join(', ') : ''
    } catch {
      return ''
    }
  }

  return (
    <div className="search" ref={containerRef}>
      <div className="search__input-wrapper">
        <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="search__input"
          placeholder={language === 'uk' ? 'Пошук книг...' : 'Search books...'}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          aria-label={language === 'uk' ? 'Пошук книг' : 'Search books'}
          aria-expanded={isOpen}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        {isLoading && <span className="search__spinner" />}
      </div>

      {isOpen && results.length > 0 && (
        <ul
          id="search-results"
          className="search__results"
          role="listbox"
        >
          {results.map((book, index) => (
            <li
              key={book.id}
              role="option"
              aria-selected={index === activeIndex}
              className={`search__result ${index === activeIndex ? 'search__result--active' : ''}`}
            >
              <LocalizedLink
                to={`/books/${book.slug}`}
                onClick={handleResultClick}
                className="search__result-link"
              >
                <div
                  className="search__result-cover"
                  style={{ backgroundColor: book.coverPath ? undefined : '#e0e0e0' }}
                >
                  {book.coverPath ? (
                    <img src={book.coverPath} alt="" />
                  ) : (
                    <span>{book.title[0]}</span>
                  )}
                </div>
                <div className="search__result-info">
                  <span className="search__result-title">{book.title}</span>
                  {parseAuthors(book.authorsJson) && (
                    <span className="search__result-author">{parseAuthors(book.authorsJson)}</span>
                  )}
                </div>
              </LocalizedLink>
            </li>
          ))}
        </ul>
      )}

      {isOpen && debouncedQuery.length >= 2 && results.length === 0 && !isLoading && (
        <div className="search__no-results">
          {language === 'uk' ? 'Нічого не знайдено' : 'No results found'}
        </div>
      )}
    </div>
  )
}
