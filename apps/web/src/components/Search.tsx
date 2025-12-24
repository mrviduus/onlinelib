import { useState, useEffect, useRef, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import { LocalizedLink } from './LocalizedLink'
import type { SearchResult, Suggestion } from '../types/api'

type SearchMode = 'suggestions' | 'results'

export function Search() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [mode, setMode] = useState<SearchMode>('suggestions')
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const api = useApi()
  const { language } = useLanguage()

  // Debounce query for suggestions (shorter delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch suggestions as user types
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([])
      if (mode === 'suggestions') setIsOpen(false)
      return
    }

    // Only fetch suggestions in suggestions mode
    if (mode !== 'suggestions') return

    let cancelled = false
    setIsLoading(true)

    api.suggest(debouncedQuery, { limit: 6 })
      .then((data) => {
        if (cancelled) return
        setSuggestions(data)
        setIsOpen(data.length > 0)
        setActiveIndex(-1)
      })
      .catch(() => {
        if (cancelled) return
        setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [debouncedQuery, api, mode])

  // Execute full search
  const executeSearch = useCallback((searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) return

    setIsLoading(true)
    setMode('results')

    api.search(searchQuery, { limit: 8, highlight: true })
      .then((data) => {
        setResults(data.items)
        setIsOpen(true)
        setActiveIndex(-1)
      })
      .catch(() => {
        setResults([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [api])

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

  // Global keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Handle input change - switch back to suggestions mode
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setMode('suggestions')
  }

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mode === 'suggestions') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          // Navigate to selected suggestion's book page
          const suggestion = suggestions[activeIndex]
          setQuery('')
          setIsOpen(false)
          window.location.href = `/${language}/books/${suggestion.slug}`
        } else {
          // Search with current query
          executeSearch(query)
        }
      } else if (mode === 'results' && activeIndex >= 0 && results[activeIndex]) {
        // Navigate to selected result
        const result = results[activeIndex]
        window.location.href = `/${language}/books/${result.edition.slug}`
      }
      return
    }

    if (!isOpen) return

    const items = mode === 'suggestions' ? suggestions : results
    if (items.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => (i < items.length - 1 ? i + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => (i > 0 ? i - 1 : items.length - 1))
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }, [isOpen, mode, suggestions, results, activeIndex, language, query, executeSearch])

  const handleResultClick = (result: SearchResult) => {
    setQuery('')
    setIsOpen(false)
    setMode('suggestions')
    window.location.href = `/${language}/books/${result.edition.slug}`
  }

  const handleViewAllClick = () => {
    setQuery('')
    setIsOpen(false)
    setMode('suggestions')
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setQuery('')
    setIsOpen(false)
    window.location.href = `/${language}/books/${suggestion.slug}`
  }

  const parseAuthors = (json: string | null): string => {
    if (!json) return ''
    try {
      const authors = JSON.parse(json)
      if (Array.isArray(authors)) {
        return authors.map(a => typeof a === 'string' ? a : a.name || a.Name).join(', ')
      }
      return ''
    } catch {
      return ''
    }
  }

  // Render highlight with HTML
  const renderHighlight = (html: string) => {
    return <span dangerouslySetInnerHTML={{ __html: html }} />
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
          onChange={handleInputChange}
          onFocus={() => {
            if (mode === 'suggestions' && suggestions.length > 0) setIsOpen(true)
            if (mode === 'results' && results.length > 0) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          aria-label={language === 'uk' ? 'Пошук книг' : 'Search books'}
          aria-expanded={isOpen}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        {isLoading && <span className="search__spinner" />}
      </div>

      {/* Suggestions dropdown */}
      {isOpen && mode === 'suggestions' && suggestions.length > 0 && (
        <div className="search__results-container">
          <ul id="search-results" className="search__results" role="listbox">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.slug}
                role="option"
                aria-selected={index === activeIndex}
                className={`search__result ${index === activeIndex ? 'search__result--active' : ''}`}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <div className="search__result-link">
                  <div
                    className="search__result-cover"
                    style={{ backgroundColor: suggestion.coverPath ? undefined : '#e0e0e0' }}
                  >
                    {suggestion.coverPath ? (
                      <img src={suggestion.coverPath} alt="" />
                    ) : (
                      <span>{suggestion.text[0]}</span>
                    )}
                  </div>
                  <div className="search__result-info">
                    <span className="search__result-title">{suggestion.text}</span>
                    {parseAuthors(suggestion.authorsJson) && (
                      <span className="search__result-author">{parseAuthors(suggestion.authorsJson)}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <LocalizedLink
            to={`/search?q=${encodeURIComponent(query)}`}
            onClick={handleViewAllClick}
            className="search__view-all"
          >
            {language === 'uk' ? 'Переглянути всі результати' : 'View all results'}
          </LocalizedLink>
        </div>
      )}

      {/* Search results dropdown */}
      {isOpen && mode === 'results' && results.length > 0 && (
        <div className="search__results-container">
          <ul id="search-results" className="search__results" role="listbox">
            {results.map((result, index) => (
              <li
                key={result.chapterId}
                role="option"
                aria-selected={index === activeIndex}
                className={`search__result ${index === activeIndex ? 'search__result--active' : ''}`}
                onClick={() => handleResultClick(result)}
              >
                <div className="search__result-link">
                  <div
                    className="search__result-cover"
                    style={{ backgroundColor: result.edition.coverPath ? undefined : '#e0e0e0' }}
                  >
                    {result.edition.coverPath ? (
                      <img src={result.edition.coverPath} alt="" />
                    ) : (
                      <span>{result.edition.title[0]}</span>
                    )}
                  </div>
                  <div className="search__result-info">
                    <span className="search__result-title">{result.edition.title}</span>
                    <span className="search__result-chapter">
                      {result.chapterTitle || `Chapter ${result.chapterNumber}`}
                    </span>
                    {parseAuthors(result.edition.authorsJson) && (
                      <span className="search__result-author">{parseAuthors(result.edition.authorsJson)}</span>
                    )}
                    {result.highlights && result.highlights.length > 0 && (
                      <div className="search__result-highlights">
                        {result.highlights.slice(0, 2).map((highlight, i) => (
                          <p key={i} className="search__result-highlight">
                            {renderHighlight(highlight)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <LocalizedLink
            to={`/search?q=${encodeURIComponent(query)}`}
            onClick={handleViewAllClick}
            className="search__view-all"
          >
            {language === 'uk' ? 'Переглянути всі результати' : 'View all results'}
          </LocalizedLink>
        </div>
      )}

      {isOpen && debouncedQuery.length >= 2 &&
       ((mode === 'suggestions' && suggestions.length === 0) ||
        (mode === 'results' && results.length === 0)) &&
       !isLoading && (
        <div className="search__no-results">
          {language === 'uk' ? 'Нічого не знайдено' : 'No results found'}
        </div>
      )}
    </div>
  )
}
