/**
 * Search Component - Interview Demo Version
 *
 * Key concepts demonstrated:
 * 1. Custom hooks for separation of concerns
 * 2. Debouncing for performance
 * 3. Keyboard accessibility
 * 4. Clean state management
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import { LocalizedLink } from './LocalizedLink'
import type { SearchResult, Suggestion } from '../types/api'

// ============================================
// TYPES
// ============================================

type SearchMode = 'suggestions' | 'results'

// ============================================
// CUSTOM HOOKS (Separation of Concerns)
// ============================================

/**
 * Hook: useDebounce
 * Why: Prevents API spam while user types
 * How: Delays value update until user stops typing
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    // Set timer to update debounced value after delay
    const timer = setTimeout(() => setDebouncedValue(value), delay)

    // Cleanup: cancel timer if value changes before delay
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook: useClickOutside
 * Why: Close dropdown when clicking outside
 * How: Listen for clicks, check if target is outside ref
 */
function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onClickOutside: () => void
) {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // If click target is outside our container, trigger callback
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ref, onClickOutside])
}

/**
 * Hook: useKeyboardShortcut
 * Why: Allow Cmd/Ctrl+K to focus search (common UX pattern)
 * How: Global keydown listener
 */
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === key) {
        e.preventDefault()
        callback()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [key, callback])
}

// ============================================
// HELPER FUNCTIONS (Pure, testable)
// ============================================

/**
 * Parse authors from JSON string
 * Why: API returns authors as JSON, we need display string
 */
function parseAuthors(json: string | null): string {
  if (!json) return ''

  try {
    const authors = JSON.parse(json)
    if (!Array.isArray(authors)) return ''

    return authors
      .map(a => (typeof a === 'string' ? a : a.name || a.Name))
      .join(', ')
  } catch {
    return ''
  }
}

/**
 * Build book URL for navigation
 */
function buildBookUrl(language: string, slug: string): string {
  return `/${language}/books/${slug}`
}

// ============================================
// SUB-COMPONENTS (Single Responsibility)
// ============================================

/** Search input with icon and loading spinner */
function SearchInput({
  inputRef,
  query,
  isLoading,
  isOpen,
  language,
  onChange,
  onFocus,
  onKeyDown,
}: {
  inputRef: React.RefObject<HTMLInputElement>
  query: string
  isLoading: boolean
  isOpen: boolean
  language: string
  onChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const placeholder = language === 'uk' ? 'Пошук книг...' : 'Search books...'
  const ariaLabel = language === 'uk' ? 'Пошук книг' : 'Search books'

  return (
    <div className="search__input-wrapper">
      {/* Magnifying glass icon */}
      <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>

      <input
        ref={inputRef}
        type="search"
        className="search__input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        // Accessibility attributes
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls="search-results"
        aria-autocomplete="list"
      />

      {/* Loading spinner - only show when fetching */}
      {isLoading && <span className="search__spinner" />}
    </div>
  )
}

/** Book cover with fallback to first letter */
function BookCover({ coverPath, title }: { coverPath?: string | null; title: string }) {
  if (coverPath) {
    return <img src={coverPath} alt="" />
  }

  // Fallback: show first letter of title
  return <span>{title[0]}</span>
}

/** Single suggestion item in dropdown */
function SuggestionItem({
  suggestion,
  isActive,
  onClick,
}: {
  suggestion: Suggestion
  isActive: boolean
  onClick: () => void
}) {
  const authors = suggestion.authors

  return (
    <li
      role="option"
      aria-selected={isActive}
      className={`search__result ${isActive ? 'search__result--active' : ''}`}
      onClick={onClick}
    >
      <div className="search__result-link">
        <div
          className="search__result-cover"
          style={{ backgroundColor: suggestion.coverPath ? undefined : '#e0e0e0' }}
        >
          <BookCover coverPath={suggestion.coverPath} title={suggestion.text} />
        </div>
        <div className="search__result-info">
          <span className="search__result-title">{suggestion.text}</span>
          {authors && <span className="search__result-author">{authors}</span>}
        </div>
      </div>
    </li>
  )
}

/** Single search result item with highlights */
function ResultItem({
  result,
  isActive,
  onClick,
}: {
  result: SearchResult
  isActive: boolean
  onClick: () => void
}) {
  const authors = result.edition.authors
  const chapterLabel = result.chapterTitle || `Chapter ${result.chapterNumber}`

  return (
    <li
      role="option"
      aria-selected={isActive}
      className={`search__result ${isActive ? 'search__result--active' : ''}`}
      onClick={onClick}
    >
      <div className="search__result-link">
        <div
          className="search__result-cover"
          style={{ backgroundColor: result.edition.coverPath ? undefined : '#e0e0e0' }}
        >
          <BookCover coverPath={result.edition.coverPath} title={result.edition.title} />
        </div>
        <div className="search__result-info">
          <span className="search__result-title">{result.edition.title}</span>
          <span className="search__result-chapter">{chapterLabel}</span>
          {authors && <span className="search__result-author">{authors}</span>}

          {/* Text highlights from search */}
          {result.highlights && result.highlights.length > 0 && (
            <div className="search__result-highlights">
              {result.highlights.slice(0, 2).map((highlight, i) => (
                <p
                  key={i}
                  className="search__result-highlight"
                  dangerouslySetInnerHTML={{ __html: highlight }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** "View all results" link at bottom of dropdown */
function ViewAllLink({
  query,
  language,
  onClick,
}: {
  query: string
  language: string
  onClick: () => void
}) {
  const text = language === 'uk' ? 'Переглянути всі результати' : 'View all results'

  return (
    <LocalizedLink
      to={`/search?q=${encodeURIComponent(query)}`}
      onClick={onClick}
      className="search__view-all"
    >
      {text}
    </LocalizedLink>
  )
}

/** "No results" message */
function NoResults({ language }: { language: string }) {
  const text = language === 'uk' ? 'Нічого не знайдено' : 'No results found'
  return <div className="search__no-results">{text}</div>
}

// ============================================
// MAIN COMPONENT
// ============================================

export function Search() {
  // ----- State -----
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [mode, setMode] = useState<SearchMode>('suggestions')
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1) // -1 = nothing selected

  // ----- Refs -----
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ----- Hooks -----
  const api = useApi()
  const { language } = useLanguage()

  // Debounce query to avoid API spam (150ms delay)
  const debouncedQuery = useDebounce(query.trim(), 150)

  // Close dropdown on click outside
  useClickOutside(containerRef as React.RefObject<HTMLElement>, () => setIsOpen(false))

  // Cmd/Ctrl+K to focus search
  useKeyboardShortcut('k', () => inputRef.current?.focus())

  // ----- Effects -----

  /**
   * Fetch suggestions when debounced query changes
   * Only in suggestions mode, min 2 chars
   */
  useEffect(() => {
    // Guard: need at least 2 characters
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([])
      if (mode === 'suggestions') setIsOpen(false)
      return
    }

    // Guard: only fetch in suggestions mode
    if (mode !== 'suggestions') return

    // Track if this effect was cancelled (for race conditions)
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

    // Cleanup function - runs if query changes before API returns
    return () => { cancelled = true }
  }, [debouncedQuery, api, mode])

  // ----- Callbacks -----

  /** Execute full text search */
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
      .catch(() => setResults([]))
      .finally(() => setIsLoading(false))
  }, [api])

  /** Handle keyboard navigation */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = mode === 'suggestions' ? suggestions : results

    // Enter: select item or execute search
    if (e.key === 'Enter') {
      e.preventDefault()

      if (mode === 'suggestions') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          // Navigate to selected suggestion
          window.location.href = buildBookUrl(language, suggestions[activeIndex].slug)
        } else {
          // Execute full search
          executeSearch(query)
        }
      } else if (activeIndex >= 0 && results[activeIndex]) {
        // Navigate to selected result
        window.location.href = buildBookUrl(language, results[activeIndex].edition.slug)
      }
      return
    }

    // Early return if dropdown closed or empty
    if (!isOpen || items.length === 0) return

    // Arrow keys: navigate list
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => (i < items.length - 1 ? i + 1 : 0)) // Wrap to start
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => (i > 0 ? i - 1 : items.length - 1)) // Wrap to end
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }, [isOpen, mode, suggestions, results, activeIndex, language, query, executeSearch])

  /** Handle input change - always switch to suggestions mode */
  const handleInputChange = (value: string) => {
    setQuery(value)
    setMode('suggestions')
  }

  /** Handle focus - reopen dropdown if we have data */
  const handleFocus = () => {
    if (mode === 'suggestions' && suggestions.length > 0) setIsOpen(true)
    if (mode === 'results' && results.length > 0) setIsOpen(true)
  }

  /** Reset state after navigation */
  const resetSearch = () => {
    setQuery('')
    setIsOpen(false)
    setMode('suggestions')
  }

  // ----- Derived state -----
  const showSuggestions = isOpen && mode === 'suggestions' && suggestions.length > 0
  const showResults = isOpen && mode === 'results' && results.length > 0
  const showNoResults = isOpen &&
    debouncedQuery.length >= 2 &&
    !isLoading &&
    ((mode === 'suggestions' && suggestions.length === 0) ||
     (mode === 'results' && results.length === 0))

  // ----- Render -----
  return (
    <div className="search" ref={containerRef}>
      {/* Input field */}
      <SearchInput
        inputRef={inputRef}
        query={query}
        isLoading={isLoading}
        isOpen={isOpen}
        language={language}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="search__results-container">
          <ul id="search-results" className="search__results" role="listbox">
            {suggestions.map((suggestion, index) => (
              <SuggestionItem
                key={suggestion.slug}
                suggestion={suggestion}
                isActive={index === activeIndex}
                onClick={() => {
                  resetSearch()
                  window.location.href = buildBookUrl(language, suggestion.slug)
                }}
              />
            ))}
          </ul>
          <ViewAllLink query={query} language={language} onClick={resetSearch} />
        </div>
      )}

      {/* Search results dropdown */}
      {showResults && (
        <div className="search__results-container">
          <ul id="search-results" className="search__results" role="listbox">
            {results.map((result, index) => (
              <ResultItem
                key={result.chapterId}
                result={result}
                isActive={index === activeIndex}
                onClick={() => {
                  resetSearch()
                  window.location.href = buildBookUrl(language, result.edition.slug)
                }}
              />
            ))}
          </ul>
          <ViewAllLink query={query} language={language} onClick={resetSearch} />
        </div>
      )}

      {/* No results message */}
      {showNoResults && <NoResults language={language} />}
    </div>
  )
}
