import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import {
  dismissLookup,
  getLookups,
  promoteLookup,
  type WordLookupDto,
} from '../../api/vocabulary'

interface Props {
  onChange?: () => void
}

export function LookupHistoryList({ onChange }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<WordLookupDto[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const resp = await getLookups({ limit: 200 }).catch(() => null)
    if (!resp) return
    setItems(resp.items)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handlePromote = async (id: string) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await promoteLookup(id)
      await refresh()
      onChange?.()
    } catch {
      setErrorMsg(t('vocabulary.lookups.promoteFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDismiss = async (id: string) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await dismissLookup(id)
      await refresh()
      onChange?.()
    } catch {
      setErrorMsg(t('vocabulary.lookups.dismissFailed'))
    } finally {
      setBusyId(null)
    }
  }

  if (items === null) {
    return <div className="vocab-loading">{t('common.loading')}</div>
  }

  if (items.length === 0) {
    return (
      <div className="vocab-pending__empty">
        <p>{t('vocabulary.lookups.emptyTitle')}</p>
        <small>{t('vocabulary.lookups.emptySubtitle')}</small>
      </div>
    )
  }

  return (
    <div className="vocab-pending">
      <div className="vocab-pending__stats">{t('vocabulary.lookups.intro')}</div>
      {errorMsg && (
        <div className="vocab-pending__error" role="alert">{errorMsg}</div>
      )}
      <ul className="vocab-pending__list">
        {items.map(l => (
          <li key={l.id} className="vocab-pending__item">
            <div className="vocab-pending__info">
              <span className="vocab-pending__word">{l.word}</span>
              {l.lastTranslation && <span className="vocab-pending__translation">— {l.lastTranslation}</span>}
              <small className="vocab-pending__source">
                {[l.bookTitle, t('vocabulary.lookups.taps').replace('{n}', String(l.tapCount))]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              {l.sentence && <small className="vocab-pending__source vocab-pending__source--quote">“{l.sentence}”</small>}
            </div>
            <div className="vocab-pending__actions">
              <button
                className="vocab-pending__promote"
                disabled={busyId === l.id}
                onClick={() => handlePromote(l.id)}
              >
                {t('vocabulary.lookups.promote')}
              </button>
              <button
                className="vocab-pending__dismiss"
                disabled={busyId === l.id}
                onClick={() => handleDismiss(l.id)}
              >
                {t('vocabulary.lookups.dismiss')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
