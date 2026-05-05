import { useTranslation } from '../../hooks/useTranslation'
import { useCollections } from '../../hooks/useCollections'

interface Props {
  activeId: string | null
  onSelect: (id: string | null) => void
}

export function CollectionChips({ activeId, onSelect }: Props) {
  const { t } = useTranslation()
  const { collections } = useCollections()

  // Hide entirely when the user has no collections yet — the chip row would be
  // a single "All books" with nothing to switch to. Sidebar is the canonical
  // entry point for creating new collections (was duplicated here).
  if (collections.length === 0) return null

  return (
    <div className="collection-chips" role="tablist" aria-label={t('library.collections.aria')}>
      <button
        type="button"
        className={`collection-chip ${!activeId ? 'collection-chip--active' : ''}`}
        onClick={() => onSelect(null)}
      >
        {t('library.collections.all')}
      </button>
      {collections.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`collection-chip collection-chip--${c.color} ${activeId === c.id ? 'collection-chip--active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <span>{c.name}</span>
          <span className="collection-chip__count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}
