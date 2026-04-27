import { useEffect, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  open: boolean
  title: string
  bodyTitle: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

export function ConfirmDeleteModal({ open, title, bodyTitle, onConfirm, onCancel, busy }: Props) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      const inPanel = active && panelRef.current.contains(active)
      if (!inPanel) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="confirm-delete-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      onClick={onCancel}
    >
      <div className="confirm-delete-modal__panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-delete-title" className="confirm-delete-modal__title">{title}</h2>
        <p className="confirm-delete-modal__body">
          {t('library.actions.confirmDeleteBody').replace('{title}', bodyTitle)}
        </p>
        <div className="confirm-delete-modal__actions">
          <button
            type="button"
            className="confirm-delete-modal__btn"
            onClick={onCancel}
            disabled={busy}
          >
            {t('library.actions.confirmDeleteCancel')}
          </button>
          <button
            ref={confirmBtn}
            type="button"
            className="confirm-delete-modal__btn confirm-delete-modal__btn--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t('library.actions.deleting') : t('library.actions.confirmDeleteConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
