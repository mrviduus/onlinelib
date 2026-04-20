import { useEffect, useRef, useState } from 'react'
import { reportHighlight } from '../../api/socialHighlights'
import { useTranslation } from '../../hooks/useTranslation'

type Reason = 'spam' | 'offensive' | 'misinformation' | 'other'

interface ReportHighlightModalProps {
  highlightId: string
  onClose: () => void
  onSubmitted: () => void
}

const REASONS: Reason[] = ['spam', 'offensive', 'misinformation', 'other']

export function ReportHighlightModal({ highlightId, onClose, onSubmitted }: ReportHighlightModalProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<Reason>('spam')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await reportHighlight(highlightId, reason, note.trim() || undefined)
      onSubmitted()
    } catch {
      setError(t('reader.report.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="report-modal__backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="report-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="report-modal__header">
          <h3>{t('reader.report.title')}</h3>
          <button
            className="report-modal__close"
            aria-label={t('reader.report.close')}
            onClick={onClose}
          >×</button>
        </header>

        <fieldset className="report-modal__reasons">
          {REASONS.map(r => (
            <label key={r} className="report-modal__reason">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{t(`reader.report.reason.${r}`)}</span>
            </label>
          ))}
        </fieldset>

        <textarea
          className="report-modal__note"
          placeholder={t('reader.report.notePlaceholder')}
          maxLength={500}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <div className="report-modal__error">{error}</div>}

        <div className="report-modal__actions">
          <button className="report-modal__cancel" onClick={onClose} disabled={submitting}>
            {t('reader.report.cancel')}
          </button>
          <button className="report-modal__submit" onClick={submit} disabled={submitting}>
            {submitting ? t('reader.report.submitting') : t('reader.report.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
