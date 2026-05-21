import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'
import { UploadForm } from './UploadForm'
import { getUserBook } from '../../api/userBooks'
import { emitDataChanges } from '../../lib/dataEvents'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  initialFile?: File
  queue?: File[]
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'processing'; bookId: string }
  | { kind: 'ready'; bookId: string; title: string; chapterCount: number }
  | { kind: 'failed'; bookId: string; message: string }

const POLL_INTERVAL_MS = 2000
// 5 min safety net — extraction shouldn't normally take this long. After
// timeout we keep the book in the user's library (server-side job continues)
// and surface an "it's still processing" message with link to library.
const POLL_TIMEOUT_MS = 5 * 60_000

export function UploadModal({ open, onClose, initialFile, queue }: UploadModalProps) {
  const containerRef = useFocusTrap(open)
  const navigate = useNavigate()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const [currentFile, setCurrentFile] = useState<File | undefined>(initialFile)
  const [pendingQueue, setPendingQueue] = useState<File[]>(queue ?? [])
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const totalRef = useRef<number>(0)
  const processedRef = useRef<number>(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStartedAtRef = useRef<number>(0)

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return
    setCurrentFile(initialFile)
    setPendingQueue(queue ?? [])
    setPhase({ kind: 'idle' })
    totalRef.current = (initialFile ? 1 : 0) + (queue?.length ?? 0)
    processedRef.current = 0
  }, [open, initialFile, queue])

  // Cleanup poll timer on unmount / close.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // Lock body scroll while modal is open. Pattern from Search/ImageLightbox.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Notify the rest of the app (LibraryPage, shelves, sidebar counts) that
  // the user's books list changed. Fires on transition into Processing (so
  // the placeholder card appears immediately) and again on Ready (cover +
  // chapter count now available). Shelves cache is invalidated alongside.
  const broadcastChange = useCallback(() => {
    emitDataChanges(['user-books', 'shelves'])
  }, [])

  const pollStatus = useCallback((bookId: string) => {
    const tick = async () => {
      if (Date.now() - pollStartedAtRef.current > POLL_TIMEOUT_MS) {
        // Timeout — book is still processing server-side. Close silently;
        // forced navigation would yank the user (e.g. from reader to library)
        // five minutes after they minimized the modal mentally. Library's own
        // 5s poll picks up the book when they navigate there themselves.
        stopPoll()
        broadcastChange()
        onClose()
        return
      }
      try {
        const detail = await getUserBook(bookId)
        if (detail.status === 'Ready') {
          stopPoll()
          broadcastChange()
          setPhase({
            kind: 'ready',
            bookId,
            title: detail.title || '',
            chapterCount: detail.chapters?.length ?? 0,
          })
          return
        }
        if (detail.status === 'Failed') {
          stopPoll()
          broadcastChange()
          setPhase({
            kind: 'failed',
            bookId,
            message: detail.errorMessage?.trim() || t('upload.status.failed'),
          })
          return
        }
      } catch {
        // Transient errors (network blip) — keep polling, give up at timeout.
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }
    pollStartedAtRef.current = Date.now()
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
  }, [onClose, navigate, getLocalizedPath, stopPoll, broadcastChange, t])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  // Step 1 of 2 done: file uploaded. If queue: kick the next file into the
  // form. Otherwise transition to Processing and start polling.
  const handleUploaded = (newBookId?: string) => {
    processedRef.current += 1

    if (pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue
      setCurrentFile(next)
      setPendingQueue(rest)
      return
    }

    if (!newBookId) {
      // Backend didn't return id (shouldn't happen). Fall back to old
      // behavior — close + navigate, library auto-poll picks up.
      broadcastChange()
      onClose()
      navigate(getLocalizedPath('/library?tab=uploads'))
      return
    }

    // Optimistically broadcast so library shows a Processing placeholder
    // immediately (the 5s library poll would catch up but this feels instant).
    broadcastChange()
    setPhase({ kind: 'processing', bookId: newBookId })
    pollStatus(newBookId)
  }

  const handleClose = () => {
    stopPoll()
    // If user closes mid-processing, dismiss without navigation. The book is
    // still being processed server-side and will appear in the library list.
    broadcastChange()
    onClose()
  }

  const handleReadNow = () => {
    if (phase.kind !== 'ready') return
    stopPoll()
    onClose()
    navigate(getLocalizedPath(`/library/my/${phase.bookId}`))
  }

  const handleViewInLibrary = () => {
    if (phase.kind === 'idle') return
    stopPoll()
    onClose()
    navigate(getLocalizedPath(`/library?tab=uploads&highlight=${encodeURIComponent(phase.bookId)}`))
  }

  const queueLabel = totalRef.current > 1 && pendingQueue.length > 0
    ? `${processedRef.current + 1} of ${totalRef.current} — next: ${pendingQueue[0]?.name ?? ''}`
    : undefined

  return createPortal(
    <div className="upload-modal__overlay" onClick={handleClose} role="presentation">
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
          onClick={handleClose}
          aria-label={t('common.close')}
          type="button"
        >
          &times;
        </button>
        <h2 id="upload-modal-title" className="upload-modal__title">
          {phase.kind === 'ready' ? t('upload.status.readyTitle') : t('upload.modal.title')}
        </h2>

        {phase.kind === 'idle' && (
          <UploadForm
            onUploadComplete={handleUploaded}
            initialFile={currentFile}
            queueLabel={queueLabel}
          />
        )}

        {phase.kind === 'processing' && (
          <div className="upload-status" aria-live="polite">
            <div className="upload-status__spinner" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 200">
                  <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1.2s" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
            <p className="upload-status__title">{t('upload.status.processing')}</p>
            <p className="upload-status__hint">{t('upload.status.processingHint')}</p>
            <button
              type="button"
              className="upload-status__secondary"
              onClick={handleViewInLibrary}
            >
              {t('upload.status.viewInLibrary')}
            </button>
          </div>
        )}

        {phase.kind === 'ready' && (
          <div className="upload-status upload-status--ready" aria-live="polite">
            <div className="upload-status__check" aria-hidden="true">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="8 12.5 11 15.5 16 9.5" />
              </svg>
            </div>
            <p className="upload-status__title">{phase.title || t('upload.status.readyFallback')}</p>
            <p className="upload-status__hint">
              {phase.chapterCount > 0
                ? t('upload.status.readyChapters', { n: phase.chapterCount })
                : t('upload.status.readyDefault')}
            </p>
            <div className="upload-status__actions">
              <button
                type="button"
                className="upload-status__primary"
                onClick={handleReadNow}
              >
                {t('upload.status.readNow')}
              </button>
              <button
                type="button"
                className="upload-status__secondary"
                onClick={handleViewInLibrary}
              >
                {t('upload.status.viewInLibrary')}
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'failed' && (
          <div className="upload-status upload-status--failed" aria-live="polite">
            <div className="upload-status__error-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="upload-status__title">{t('upload.status.failedTitle')}</p>
            <p className="upload-status__hint">{phase.message}</p>
            <div className="upload-status__actions">
              <button
                type="button"
                className="upload-status__secondary"
                onClick={handleViewInLibrary}
              >
                {t('upload.status.viewInLibrary')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

