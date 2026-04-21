import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import {
  dismissPendingWord,
  getPendingWords,
  promotePendingWord,
  type PendingVocabWordDto,
} from '../../api/vocabulary'

interface Props {
  onChange?: () => void
}

export function PendingQueueList({ onChange }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PendingVocabWordDto[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [stats, setStats] = useState<{ used: number; cap: number; remaining: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const resp = await getPendingWords().catch(() => null)
    if (!resp) return
    setItems(resp.items)
    setStats({ used: resp.dailyUsed, cap: resp.dailyCap, remaining: resp.dailyRemaining })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handlePromote = async (id: string) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await promotePendingWord(id)
      await refresh()
      onChange?.()
    } catch {
      setErrorMsg(t('vocabulary.pending.promoteFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDismiss = async (id: string) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      await dismissPendingWord(id)
      await refresh()
      onChange?.()
    } catch {
      setErrorMsg(t('vocabulary.pending.dismissFailed'))
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
        <p>{t('vocabulary.pending.emptyTitle')}</p>
        <small>{t('vocabulary.pending.emptySubtitle')}</small>
      </div>
    )
  }

  return (
    <div className="vocab-pending">
      {stats && (
        <div className="vocab-pending__stats">
          {t('vocabulary.pending.dailyStatus')
            .replace('{used}', String(stats.used))
            .replace('{cap}', String(stats.cap))}
        </div>
      )}
      {errorMsg && (
        <div className="vocab-pending__error" role="alert">{errorMsg}</div>
      )}
      <ul className="vocab-pending__list">
        {items.map(p => (
          <li key={p.id} className="vocab-pending__item">
            <div className="vocab-pending__info">
              <span className="vocab-pending__word">{p.word}</span>
              {p.translation && <span className="vocab-pending__translation">— {p.translation}</span>}
              {p.bookTitle && <small className="vocab-pending__source">{p.bookTitle}</small>}
            </div>
            <div className="vocab-pending__actions">
              <button
                className="vocab-pending__promote"
                disabled={busyId === p.id}
                onClick={() => handlePromote(p.id)}
              >
                {t('vocabulary.pending.promote')}
              </button>
              <button
                className="vocab-pending__dismiss"
                disabled={busyId === p.id}
                onClick={() => handleDismiss(p.id)}
              >
                {t('vocabulary.pending.dismiss')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
