import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import type { LibraryFilterKey } from '../../hooks/useLibraryFilter'
import type { TagCount } from '../../api/userBooks'

const ORDER: LibraryFilterKey[] = ['all', 'reading', 'finished', 'notStarted', 'failed']

interface Props {
  value: LibraryFilterKey
  onChange: (next: LibraryFilterKey) => void
  counts: Record<LibraryFilterKey, number>
  tags?: TagCount[]
  activeTag?: string | null
  onTagClick?: (tag: string | null) => void
}

export function LibraryFilters({ value, onChange, counts, tags, activeTag, onTagClick }: Props) {
  const { t } = useTranslation()
  const [tagsOpen, setTagsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagsOpen) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setTagsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [tagsOpen])

  const showTags = !!(tags && tags.length > 0 && onTagClick)
  const topTags = (tags ?? []).slice(0, 20)

  return (
    <div className="library-filters" role="tablist" aria-label="Filter library">
      {ORDER.map(key => {
        if (key === 'failed' && counts.failed === 0) return null
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`library-filters__chip ${active ? 'library-filters__chip--active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span>{t(`library.filter.${key}`)}</span>
            <span className="library-filters__count">{counts[key]}</span>
          </button>
        )
      })}
      {showTags && (
        <div ref={wrapRef} className="library-filters__tags">
          <button
            type="button"
            className={`library-filters__chip ${activeTag ? 'library-filters__chip--active' : ''}`}
            onClick={() => setTagsOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={tagsOpen}
          >
            <span>{activeTag ? `#${activeTag}` : t('library.tags.dropdown')}</span>
            <span aria-hidden="true">▾</span>
          </button>
          {tagsOpen && (
            <ul className="library-filters__tags-menu" role="listbox">
              {activeTag && (
                <li>
                  <button
                    type="button"
                    className="library-filters__tag-item"
                    onClick={() => { onTagClick?.(null); setTagsOpen(false) }}
                  >
                    <span>{t('library.tags.clear')}</span>
                  </button>
                </li>
              )}
              {topTags.map((t) => (
                <li key={t.tag}>
                  <button
                    type="button"
                    className={`library-filters__tag-item ${activeTag === t.tag ? 'library-filters__tag-item--active' : ''}`}
                    onClick={() => { onTagClick?.(t.tag); setTagsOpen(false) }}
                  >
                    <span>#{t.tag}</span>
                    <span className="library-filters__count">{t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
