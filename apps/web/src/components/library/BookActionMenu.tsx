import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import { useLanguage } from '../../context/LanguageContext'
import { useBookActions } from '../../hooks/useBookActions'
import { useCollections, invalidateCollectionsCache } from '../../hooks/useCollections'
import { addBookToCollection, type BookType } from '../../api/collections'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { UserBookEditModal } from './UserBookEditModal'
import type { LibraryItem } from '../../api/auth'
import type { UserBook } from '../../api/userBooks'

type SavedProps = {
  type: 'saved'
  book: LibraryItem
  isFinished: boolean
  onMarkFinished: () => void
  onMarkUnfinished: () => void
  onRemove: () => void
}

type UserBookProps = {
  type: 'userbook'
  book: UserBook
  onChange: () => void
}

type Props = SavedProps | UserBookProps

export function BookActionMenu(props: Props) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (!wrapRef.current) return
      const items = Array.from(
        wrapRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])'),
      )
      if (items.length === 0) return
      const idx = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        items[(idx + 1 + items.length) % items.length].focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        items[(idx - 1 + items.length) % items.length].focus()
      } else if (e.key === 'Home') {
        e.preventDefault(); items[0].focus()
      } else if (e.key === 'End') {
        e.preventDefault(); items[items.length - 1].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const first = wrapRef.current.querySelector<HTMLElement>('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])')
    first?.focus()
  }, [open])

  if (props.type === 'saved') {
    return (
      <SavedMenu
        {...props}
        wrapRef={wrapRef}
        open={open}
        setOpen={setOpen}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        t={t}
        navigate={navigate}
        language={language}
      />
    )
  }

  return (
    <UserBookMenu
      {...props}
      wrapRef={wrapRef}
      open={open}
      setOpen={setOpen}
      confirmDelete={confirmDelete}
      setConfirmDelete={setConfirmDelete}
      t={t}
      navigate={navigate}
      language={language}
    />
  )
}

interface SharedRender {
  wrapRef: React.RefObject<HTMLDivElement | null>
  open: boolean
  setOpen: (v: boolean) => void
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  navigate: ReturnType<typeof useNavigate>
  language: string
}

function Trigger({ open, setOpen, t }: { open: boolean; setOpen: (v: boolean) => void; t: SharedRender['t'] }) {
  return (
    <button
      type="button"
      className="book-card-menu__trigger"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={t('library.actions.menu')}
      title={t('library.actions.menu')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  )
}

type Toast = { msg: string; tone: 'success' | 'error' }

function SavedMenu({
  book, isFinished, onMarkFinished, onMarkUnfinished, onRemove,
  wrapRef, open, setOpen, confirmDelete, setConfirmDelete, t, navigate, language,
}: SavedProps & SharedRender) {
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => {
    if (!toast) return
    const ms = toast.tone === 'error' ? 4000 : 2500
    const id = window.setTimeout(() => setToast(null), ms)
    return () => window.clearTimeout(id)
  }, [toast])
  return (
    <div className="book-card-menu" ref={wrapRef}>
      {toast && (
        <div className={`book-card-menu__toast book-card-menu__toast--${toast.tone}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
      <Trigger open={open} setOpen={setOpen} t={t} />
      {open && (
        <div className="book-card-menu__dropdown" role="menu">
          <button className="book-card-menu__item" role="menuitem" onClick={() => { setOpen(false); navigate(`/${language}/books/${book.slug}`) }}>
            {t('library.actions.viewDetails')}
          </button>
          <button
            className="book-card-menu__item"
            role="menuitem"
            onClick={() => { setOpen(false); isFinished ? onMarkUnfinished() : onMarkFinished() }}
          >
            {isFinished ? t('library.actions.markUnfinished') : t('library.actions.markFinished')}
          </button>
          <AddToCollectionItem
            bookId={book.editionId}
            bookType="savedbook"
            t={t}
            close={() => setOpen(false)}
            onToast={setToast}
          />
          <div className="book-card-menu__divider" />
          <button
            className="book-card-menu__item book-card-menu__item--danger"
            role="menuitem"
            onClick={() => { setOpen(false); setConfirmDelete(true) }}
          >
            {t('library.actions.removeFromLibrary')}
          </button>
        </div>
      )}
      <ConfirmDeleteModal
        open={confirmDelete}
        title={t('library.actions.confirmDeleteTitle')}
        bodyTitle={book.title}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); onRemove() }}
      />
    </div>
  )
}

function AddToCollectionItem({
  bookId, bookType, t, close, onToast,
}: {
  bookId: string
  bookType: BookType
  t: SharedRender['t']
  close: () => void
  onToast: (toast: Toast) => void
}) {
  const { collections } = useCollections()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const handlePick = async (collectionId: string, name: string) => {
    if (busy) return
    setBusy(true)
    try {
      await addBookToCollection(collectionId, bookId, bookType)
      invalidateCollectionsCache()
      onToast({ msg: t('library.actions.addedToCollection', { name }), tone: 'success' })
      setExpanded(false)
      close()
    } catch {
      onToast({ msg: t('library.actions.addToCollectionFailed'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

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

function UserBookMenu({
  book, onChange,
  wrapRef, open, setOpen, confirmDelete, setConfirmDelete, t, navigate, language,
}: UserBookProps & SharedRender) {
  const actions = useBookActions(book, { onChange })
  const isReady = book.status === 'Ready'
  const isFailed = book.status === 'Failed'
  const isProcessing = book.status === 'Processing'
  const isFinished = !!book.completedAt
  const [toast, setToast] = useState<Toast | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!actions.error) return
    setToast({ msg: actions.error, tone: 'error' })
  }, [actions.error])

  useEffect(() => {
    if (!toast) return
    const ms = toast.tone === 'error' ? 4000 : 2500
    const id = window.setTimeout(() => setToast(null), ms)
    return () => window.clearTimeout(id)
  }, [toast])

  const close = () => setOpen(false)

  return (
    <div className="book-card-menu" ref={wrapRef}>
      {toast && (
        <div className={`book-card-menu__toast book-card-menu__toast--${toast.tone}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
      <Trigger open={open} setOpen={setOpen} t={t} />
      {open && (
        <div className="book-card-menu__dropdown" role="menu">
          {isReady && (
            <button className="book-card-menu__item" role="menuitem" onClick={() => { close(); navigate(`/${language}/library/my/${book.id}`) }}>
              {t('library.actions.viewDetails')}
            </button>
          )}
          {isReady && (
            <button
              className="book-card-menu__item"
              role="menuitem"
              disabled={actions.pending === 'mark'}
              onClick={async () => { close(); await (isFinished ? actions.markUnfinished() : actions.markFinished()) }}
            >
              {isFinished ? t('library.actions.markUnfinished') : t('library.actions.markFinished')}
            </button>
          )}
          {isReady && (
            <button
              className="book-card-menu__item"
              role="menuitem"
              onClick={() => { close(); setEditOpen(true) }}
            >
              {t('library.actions.editMetadata')}
            </button>
          )}
          {isReady && (
            <AddToCollectionItem
              bookId={book.id}
              bookType="userbook"
              t={t}
              close={close}
              onToast={setToast}
            />
          )}
          {isFailed && (
            <button
              className="book-card-menu__item"
              role="menuitem"
              disabled={actions.pending === 'retry'}
              onClick={async () => { close(); await actions.retry() }}
            >
              {actions.pending === 'retry' ? t('library.actions.retrying') : t('library.actions.retry')}
            </button>
          )}
          {isProcessing && (
            <button
              className="book-card-menu__item book-card-menu__item--danger"
              role="menuitem"
              disabled={actions.pending === 'cancel'}
              onClick={async () => { close(); await actions.cancel() }}
            >
              {actions.pending === 'cancel' ? t('library.actions.cancelling') : t('library.actions.cancel')}
            </button>
          )}
          <div className="book-card-menu__divider" />
          <button
            className="book-card-menu__item book-card-menu__item--danger"
            role="menuitem"
            onClick={() => { close(); setConfirmDelete(true) }}
          >
            {t('library.actions.delete')}
          </button>
        </div>
      )}
      <ConfirmDeleteModal
        open={confirmDelete}
        title={t('library.actions.confirmDeleteTitle')}
        bodyTitle={book.title}
        busy={actions.pending === 'delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => { await actions.remove(); setConfirmDelete(false) }}
      />
      <UserBookEditModal
        open={editOpen}
        book={book}
        onClose={() => setEditOpen(false)}
        onSaved={onChange}
      />
    </div>
  )
}
