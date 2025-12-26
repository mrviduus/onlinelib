import { useState, useEffect, useRef, useCallback } from 'react'
import { adminApi, AuthorSearchResult } from '../api/client'
import './AuthorAutocomplete.css'

interface AuthorAutocompleteProps {
  siteId: string
  onSelect: (author: { id: string; name: string }) => void
  onCreateNew: (name: string) => void
  excludeIds?: string[]
  placeholder?: string
}

export function AuthorAutocomplete({
  siteId,
  onSelect,
  onCreateNew,
  excludeIds = [],
  placeholder = 'Search authors...'
}: AuthorAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AuthorSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const filteredResults = results.filter(r => !excludeIds.includes(r.id))
  const showCreateOption = query.trim().length >= 2 &&
    !filteredResults.some(r => r.name.toLowerCase() === query.trim().toLowerCase())

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const data = await adminApi.searchAuthors(siteId, q, 10)
      setResults(data)
      setIsOpen(true)
      setHighlightedIndex(-1)
    } catch (err) {
      console.error('Author search failed:', err)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      search(query)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, search])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalOptions = filteredResults.length + (showCreateOption ? 1 : 0)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key === 'ArrowDown' && query.length >= 2) {
      setIsOpen(true)
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, totalOptions - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredResults.length) {
          handleSelect(filteredResults[highlightedIndex])
        } else if (highlightedIndex === filteredResults.length && showCreateOption) {
          handleCreateNew()
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  const handleSelect = (author: AuthorSearchResult) => {
    onSelect({ id: author.id, name: author.name })
    setQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleCreateNew = () => {
    const name = query.trim()
    if (name.length >= 2) {
      onCreateNew(name)
      setQuery('')
      setResults([])
      setIsOpen(false)
    }
  }

  return (
    <div className="author-autocomplete" ref={containerRef}>
      <div className="author-autocomplete__input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          className="author-autocomplete__input"
          autoComplete="off"
        />
        {isLoading && <span className="author-autocomplete__spinner" />}
      </div>

      {isOpen && (filteredResults.length > 0 || showCreateOption) && (
        <ul className="author-autocomplete__dropdown">
          {filteredResults.map((author, index) => (
            <li
              key={author.id}
              className={`author-autocomplete__option ${index === highlightedIndex ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => handleSelect(author)}
            >
              <span className="author-autocomplete__name">{author.name}</span>
              <span className="author-autocomplete__count">{author.bookCount} books</span>
            </li>
          ))}
          {showCreateOption && (
            <li
              className={`author-autocomplete__option author-autocomplete__option--create ${highlightedIndex === filteredResults.length ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(filteredResults.length)}
              onClick={handleCreateNew}
            >
              <span className="author-autocomplete__create-icon">+</span>
              <span>Create "{query.trim()}"</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
