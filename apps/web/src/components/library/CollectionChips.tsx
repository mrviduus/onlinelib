import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useCollections } from '../../hooks/useCollections'

interface Props {
  activeId: string | null
  onSelect: (id: string | null) => void
}

export function CollectionChips({ activeId, onSelect }: Props) {
  const { t } = useTranslation()
  const { collections, create } = useCollections()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const c = await create(trimmed)
      onSelect(c.id)
      setName('')
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

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
      {creating ? (
        <form className="collection-chip__form" onSubmit={(e) => { e.preventDefault(); handleCreate() }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('library.collections.newPlaceholder')}
            maxLength={100}
            autoFocus
            disabled={busy}
          />
          <button type="submit" disabled={busy || !name.trim()}>{t('library.collections.add')}</button>
          <button type="button" onClick={() => { setCreating(false); setName('') }}>×</button>
        </form>
      ) : (
        <button
          type="button"
          className="collection-chip collection-chip--add"
          onClick={() => setCreating(true)}
        >
          + {t('library.collections.new')}
        </button>
      )}
    </div>
  )
}
