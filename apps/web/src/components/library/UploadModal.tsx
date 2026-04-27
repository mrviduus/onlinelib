import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'
import { UploadForm } from './UploadForm'

interface UploadModalProps {
  open: boolean
  onClose: () => void
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const containerRef = useFocusTrap(open)
  const navigate = useNavigate()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleComplete = (newBookId?: string) => {
    onClose()
    const target = newBookId
      ? `/library?tab=uploads&highlight=${encodeURIComponent(newBookId)}`
      : '/library?tab=uploads'
    navigate(getLocalizedPath(target))
  }

  return createPortal(
    <div className="upload-modal__overlay" onClick={onClose} role="presentation">
      <div
        ref={containerRef}
        className="upload-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
      >
        <button
          className="upload-modal__close"
          onClick={onClose}
          aria-label={t('common.close')}
          type="button"
        >
          &times;
        </button>
        <h2 id="upload-modal-title" className="upload-modal__title">{t('upload.modal.title')}</h2>
        <UploadForm onUploadComplete={handleComplete} />
      </div>
    </div>,
    document.body,
  )
}
