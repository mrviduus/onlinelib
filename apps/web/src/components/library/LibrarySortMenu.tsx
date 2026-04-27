import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import type { LibrarySortKey } from '../../hooks/useLibrarySort'

const ORDER: LibrarySortKey[] = ['recent', 'added', 'title', 'author', 'progress']

interface Props {
  value: LibrarySortKey
  onChange: (next: LibrarySortKey) => void
}

export function LibrarySortMenu({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="library-sort">
      <button
        type="button"
        className="library-sort__trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {t('library.sort.label')}: {t(`library.sort.${value}`)}
        <span className="material-icons-outlined">expand_more</span>
      </button>
      {open && (
        <>
          <div className="library-sort__backdrop" onClick={() => setOpen(false)} />
          <div className="library-sort__menu" role="menu">
            {ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`library-sort__option ${value === key ? 'library-sort__option--active' : ''}`}
                onClick={() => { onChange(key); setOpen(false) }}
              >
                {t(`library.sort.${key}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
