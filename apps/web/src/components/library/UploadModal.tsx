import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'
import { UploadForm } from './UploadForm'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  initialFile?: File
  queue?: File[]
}

export function UploadModal({ open, onClose, initialFile, queue }: UploadModalProps) {
  const containerRef = useFocusTrap(open)
  const navigate = useNavigate()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const [currentFile, setCurrentFile] = useState<File | undefined>(initialFile)
  const [pendingQueue, setPendingQueue] = useState<File[]>(queue ?? [])
  const totalRef = useRef<number>(0)
  const processedRef = useRef<number>(0)

  useEffect(() => {
    if (!open) return
    setCurrentFile(initialFile)
    setPendingQueue(queue ?? [])
    totalRef.current = (initialFile ? 1 : 0) + (queue?.length ?? 0)
    processedRef.current = 0
  }, [open, initialFile, queue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleComplete = (newBookId?: string) => {
    processedRef.current += 1
    if (pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue
      setCurrentFile(next)
      setPendingQueue(rest)
      return
    }
    onClose()
    const target = newBookId
      ? `/library?tab=uploads&highlight=${encodeURIComponent(newBookId)}`
      : '/library?tab=uploads'
    navigate(getLocalizedPath(target))
  }

  const queueLabel = totalRef.current > 1 && pendingQueue.length > 0
    ? `${processedRef.current + 1} of ${totalRef.current} — next: ${pendingQueue[0]?.name ?? ''}`
    : undefined

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
        <UploadForm
          onUploadComplete={handleComplete}
          initialFile={currentFile}
          queueLabel={queueLabel}
        />
      </div>
    </div>,
    document.body,
  )
}
