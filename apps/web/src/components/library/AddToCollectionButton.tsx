import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { useCollections, invalidateCollectionsCache } from '../../hooks/useCollections'
import { addBookToCollection, type BookType } from '../../api/collections'

export type Toast = { msg: string; tone: 'success' | 'error' }

interface CommonProps {
  bookId: string
  bookType: BookType
  onToast?: (toast: Toast) => void
}

interface MenuVariantProps extends CommonProps {
  variant: 'menu'
  close: () => void
}

interface ButtonVariantProps extends CommonProps {
  variant: 'button'
  className?: string
}

type Props = MenuVariantProps | ButtonVariantProps

export function AddToCollectionButton(props: Props) {
  const { t } = useTranslation()
  const { collections } = useCollections()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localToast, setLocalToast] = useState<Toast | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!localToast) return
    const ms = localToast.tone === 'error' ? 4000 : 2500
    const id = window.setTimeout(() => setLocalToast(null), ms)
    return () => window.clearTimeout(id)
  }, [localToast])

  useEffect(() => {
    if (!expanded || props.variant !== 'button') return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded, props.variant])

  const emitToast = (toast: Toast) => {
    if (props.onToast) props.onToast(toast)
    else setLocalToast(toast)
  }

  const handlePick = async (collectionId: string, name: string) => {
    if (busy) return
    setBusy(true)
    try {
      await addBookToCollection(collectionId, props.bookId, props.bookType)
      invalidateCollectionsCache()
      emitToast({ msg: t('library.actions.addedToCollection', { name }), tone: 'success' })
      setExpanded(false)
      if (props.variant === 'menu') props.close()
    } catch {
      emitToast({ msg: t('library.actions.addToCollectionFailed'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (props.variant === 'menu') {
    if (collections.length === 0) {
      return (
        <button
          className="book-card-menu__item"
          role="menuitem"
          disabled
          aria-disabled="true"
          title={t('library.actions.addToCollectionEmpty')}
        >
          {t('library.actions.addToCollection')}
        </button>
      )
    }
    return (
      <>
        <button
          className="book-card-menu__item"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={expanded}
          onClick={(e) => { e.preventDefault(); setExpanded((v) => !v) }}
        >
          {t('library.actions.addToCollection')}
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.6 }}>{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && (
          <div className="book-card-menu__submenu" role="menu">
            {collections.map((c) => (
              <button
                key={c.id}
                className="book-card-menu__item"
                role="menuitem"
                disabled={busy}
                onClick={() => handlePick(c.id, c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </>
    )
  }

  // variant === 'button'
  const baseClass = props.className || 'add-to-collection-button'
  if (collections.length === 0) {
    return (
      <button
        type="button"
        className={baseClass}
        disabled
        aria-disabled="true"
        title={t('library.actions.addToCollectionEmpty')}
      >
        {t('library.actions.addToCollection')}
      </button>
    )
  }
  return (
    <div className="add-to-collection" ref={wrapRef}>
      {localToast && (
        <div className={`add-to-collection__toast add-to-collection__toast--${localToast.tone}`} role="status" aria-live="polite">
          {localToast.msg}
        </div>
      )}
      <button
        type="button"
        className={baseClass}
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {t('library.actions.addToCollection')}
      </button>
      {expanded && (
        <div className="add-to-collection__popover" role="menu">
          {collections.map((c) => (
            <button
              key={c.id}
              type="button"
              className="add-to-collection__option"
              role="menuitem"
              disabled={busy}
              onClick={() => handlePick(c.id, c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
