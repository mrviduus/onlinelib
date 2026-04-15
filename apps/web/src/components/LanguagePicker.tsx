import { useState, useRef, useEffect, useMemo, useId } from 'react'
import {
  LANGUAGES,
  POPULAR_LANGUAGES,
  OTHER_LANGUAGES,
  getLanguage,
  getFlagUrl,
  type LanguageEntry,
} from '../data/languages'
import { useNativeLanguage } from '../context/NativeLanguageContext'

interface Props {
  value: string
  onChange: (code: string) => void
  ariaLabel?: string
  prefix?: string
  /**
   * Language code to exclude from the picker. The user shouldn't pick a
   * "native" language equal to the language they're reading — same code on
   * both sides is a meaningless state. When `value === excludeCode`, the
   * trigger renders empty (no flag, no name) so the pulse animation reads
   * as "you still need to pick something here", and the dropdown list omits
   * that code entirely.
   */
  excludeCode?: string
}

export function LanguagePicker({ value, onChange, ariaLabel = 'Native language', prefix, excludeCode }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const { hasConfirmedLanguage } = useNativeLanguage()
  const isEmpty = !!excludeCode && value === excludeCode
  const showPulse = !hasConfirmedLanguage && !open

  const current = getLanguage(value) || LANGUAGES[0]

  const filterFn = (l: LanguageEntry) => !excludeCode || l.code !== excludeCode

  const filtered = useMemo<LanguageEntry[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return LANGUAGES.filter(
      (l) =>
        filterFn(l) &&
        (l.englishName.toLowerCase().includes(q) ||
          l.nativeName.toLowerCase().includes(q) ||
          l.code.toLowerCase().startsWith(q)),
    )
  }, [query, excludeCode])

  const popularList = useMemo(() => POPULAR_LANGUAGES.filter(filterFn), [excludeCode])
  const otherList = useMemo(() => OTHER_LANGUAGES.filter(filterFn), [excludeCode])

  // Flat list for keyboard navigation — what's actually shown in order
  const navigableList = useMemo<LanguageEntry[]>(() => {
    if (query.trim()) return filtered
    return [...popularList, ...otherList]
  }, [query, filtered, popularList, otherList])

  // Outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Autofocus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
      setHighlightedIndex(0)
    } else {
      setQuery('')
    }
  }, [open])

  // Ensure highlighted option stays in view
  useEffect(() => {
    if (!open) return
    const el = document.getElementById(`${listboxId}-opt-${highlightedIndex}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, open, listboxId])

  const select = (code: string) => {
    onChange(code)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, navigableList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const lang = navigableList[highlightedIndex]
      if (lang) select(lang.code)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const renderOption = (lang: LanguageEntry, index: number) => (
    <li
      id={`${listboxId}-opt-${index}`}
      key={lang.code}
      role="option"
      aria-selected={lang.code === value}
      className={`lang-picker__option ${index === highlightedIndex ? 'highlighted' : ''} ${lang.code === value ? 'selected' : ''}`}
      onMouseEnter={() => setHighlightedIndex(index)}
      onClick={() => select(lang.code)}
    >
      <img className="lang-picker__flag" src={getFlagUrl(lang.code)} alt="" width="20" height="15" />
      <span className="lang-picker__native">{lang.nativeName}</span>
      {lang.englishName !== lang.nativeName && (
        <span className="lang-picker__english">{lang.englishName}</span>
      )}
    </li>
  )

  return (
    <div className="lang-ctx__side lang-picker" ref={containerRef}>
      {showPulse && <span className="lang-ctx__pulse" aria-hidden="true" />}
      <button
        className={`lang-ctx__trigger${isEmpty ? ' lang-ctx__trigger--empty' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        {isEmpty ? (
          <GlobeIcon />
        ) : (
          <img className="lang-ctx__flag" src={getFlagUrl(current.code)} alt="" width="20" height="15" />
        )}
        {prefix && <span className="lang-ctx__prefix">{prefix}</span>}
        <span className="lang-ctx__lang">{isEmpty ? '' : current.nativeName}</span>
        <Chevron />
      </button>

      {open && (
        <div className="lang-picker__popover" role="dialog" aria-label={ariaLabel}>
          <div className="lang-picker__search">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search language..."
              className="lang-picker__input"
              autoComplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={`${listboxId}-opt-${highlightedIndex}`}
            />
          </div>

          <ul id={listboxId} role="listbox" className="lang-picker__list">
            {query.trim() ? (
              filtered.length === 0 ? (
                <li className="lang-picker__empty">No results for "{query.trim()}"</li>
              ) : (
                filtered.map((lang, i) => renderOption(lang, i))
              )
            ) : (
              <>
                <li className="lang-picker__section" role="presentation">Popular</li>
                {popularList.map((lang, i) => renderOption(lang, i))}
                <li className="lang-picker__section" role="presentation">All languages</li>
                {otherList.map((lang, i) =>
                  renderOption(lang, i + popularList.length),
                )}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function Chevron() {
  return (
    <svg className="lang-ctx__chevron" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Generic globe — placeholder when no native language is picked yet.
// Sized to match flag visuals (20×15 box, glyph ~14×14 centered).
function GlobeIcon() {
  return (
    <svg
      className="lang-ctx__flag lang-ctx__globe"
      viewBox="0 0 20 15"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="10" cy="7.5" rx="2.5" ry="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 7.5h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
