import { useTranslation } from '../../hooks/useTranslation'
import type { LibraryFilterKey } from '../../hooks/useLibraryFilter'

const ORDER: LibraryFilterKey[] = ['all', 'reading', 'finished', 'notStarted', 'failed']

interface Props {
  value: LibraryFilterKey
  onChange: (next: LibraryFilterKey) => void
  counts: Record<LibraryFilterKey, number>
}

export function LibraryFilters({ value, onChange, counts }: Props) {
  const { t } = useTranslation()
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
    </div>
  )
}
