import { useState, useEffect, useRef } from 'react'
import { adminApi, GenreSearchResult } from '../api/client'

interface SelectedGenre {
  id: string
  name: string
}

interface GenreSelectProps {
  siteId: string
  selected: SelectedGenre[]
  onChange: (genres: SelectedGenre[]) => void
  maxSelections?: number
}

export function GenreSelect({ siteId, selected, onChange, maxSelections }: GenreSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GenreSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await adminApi.searchGenres(siteId, query || undefined, 10)
        // Filter out already selected genres
        const filtered = data.filter(g => !selected.some(s => s.id === g.id))
        setResults(filtered)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, siteId, selected])

  const handleSelect = (genre: GenreSearchResult) => {
    onChange([...selected, { id: genre.id, name: genre.name }])
    setQuery('')
    setIsOpen(false)
  }

  const handleRemove = (id: string) => {
    onChange(selected.filter(g => g.id !== id))
  }

  const showWarning = selected.length > 3
  const atMaxSelections = maxSelections !== undefined && selected.length >= maxSelections

  return (
    <div className="genre-select" ref={containerRef}>
      <div className="genre-select__selected">
        {selected.map(genre => (
          <span key={genre.id} className="genre-tag">
            {genre.name}
            <button type="button" onClick={() => handleRemove(genre.id)} className="genre-tag__remove">
              &times;
            </button>
          </span>
        ))}
      </div>

      {!atMaxSelections && (
        <div className="genre-select__input-container">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search genres..."
            className="genre-select__input"
          />
          {isOpen && (
            <div className="genre-select__dropdown">
              {loading ? (
                <div className="genre-select__loading">Loading...</div>
              ) : results.length === 0 ? (
                <div className="genre-select__empty">No genres found</div>
              ) : (
                results.map(genre => (
                  <button
                    key={genre.id}
                    type="button"
                    className="genre-select__option"
                    onClick={() => handleSelect(genre)}
                  >
                    <span className="genre-select__option-name">{genre.name}</span>
                    <span className="genre-select__option-count">{genre.editionCount} editions</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <small className="genre-select__hint">
        Optional. Used for search/SEO/recommendations. Suggested: up to 3.
        {showWarning && <span className="genre-select__warning"> More than 3 genres selected.</span>}
      </small>
    </div>
  )
}
