import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { acceptSuggestedTags, dismissSuggestedTags } from '../../api/userBooks'
import { invalidateUserTagsCache } from '../../hooks/useUserTags'

interface Props {
  bookId: string
  suggestions: string[]
  existingTags: string[]
  onClose: () => void
  onApplied: () => void
}

export function SuggestedTagsPopover({ bookId, suggestions, existingTags, onClose, onApplied }: Props) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  const existingSet = useMemo(() => new Set(existingTags), [existingTags])
  const fresh = useMemo(() => suggestions.filter((s) => !existingSet.has(s)), [suggestions, existingSet])
  const [picked, setPicked] = useState<Set<string>>(() => new Set(fresh))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const toggle = (tag: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
  }

  const accept = async () => {
    if (busy) return
    setBusy(true)
    try {
      await acceptSuggestedTags(bookId, Array.from(picked))
      invalidateUserTagsCache()
      onApplied()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (busy) return
    setBusy(true)
    try {
      await dismissSuggestedTags(bookId)
      onApplied()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={wrapRef} className="suggested-tags-popover" role="dialog" aria-label={t('library.suggestedTags.title')}>
      <div className="suggested-tags-popover__title">{t('library.suggestedTags.title')}</div>
      <div className="suggested-tags-popover__subtitle">{t('library.suggestedTags.subtitle')}</div>
      {fresh.length === 0 ? (
        <div className="suggested-tags-popover__empty">{t('library.suggestedTags.empty')}</div>
      ) : (
        <ul className="suggested-tags-popover__list">
          {fresh.map((tag) => (
            <li key={tag}>
              <label className="suggested-tags-popover__row">
                <input
                  type="checkbox"
                  checked={picked.has(tag)}
                  onChange={() => toggle(tag)}
                />
                <span className="suggested-tags-popover__tag">#{tag}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="suggested-tags-popover__actions">
        <button type="button" className="suggested-tags-popover__btn suggested-tags-popover__btn--secondary" onClick={dismiss} disabled={busy}>
          {t('library.suggestedTags.dismiss')}
        </button>
        <button type="button" className="suggested-tags-popover__btn suggested-tags-popover__btn--primary" onClick={accept} disabled={busy || picked.size === 0}>
          {t('library.suggestedTags.add')}
        </button>
      </div>
    </div>
  )
}
