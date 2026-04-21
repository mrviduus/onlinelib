import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useTranslation } from '../../hooks/useTranslation'
import {
  dismissCluster,
  getClusters,
  type WordClusterDto,
} from '../../api/vocabulary'

interface Props {
  onChange?: () => void
}

export function ClusterBonusCard({ onChange }: Props) {
  const { t } = useTranslation()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  const [cluster, setCluster] = useState<WordClusterDto | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const resp = await getClusters()
      setCluster(resp.items[0] ?? null)
    } catch {
      setCluster(null)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (!cluster) return null

  const handleStart = () => {
    navigate(`${getLocalizedPath('/vocabulary/review')}?cluster=${cluster.id}&reviewMode=blitz`)
  }

  const handleDismiss = async () => {
    setBusy(true)
    try {
      await dismissCluster(cluster.id)
      setCluster(null)
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  const subtitle = cluster.bookTitle
    ? t('vocabulary.clusters.fromBook').replace('{book}', cluster.bookTitle)
    : null

  return (
    <div className="vocab-cluster-card">
      <div className="vocab-cluster-card__body">
        <div className="vocab-cluster-card__icon" aria-hidden>✨</div>
        <div className="vocab-cluster-card__text">
          <div className="vocab-cluster-card__title">{cluster.title}</div>
          <div className="vocab-cluster-card__meta">
            {t('vocabulary.clusters.bonusCta').replace('{n}', String(cluster.memberCount))}
            {subtitle && <span className="vocab-cluster-card__sep"> · </span>}
            {subtitle && <span className="vocab-cluster-card__book">{subtitle}</span>}
          </div>
        </div>
      </div>
      <div className="vocab-cluster-card__actions">
        <button
          type="button"
          className="vocab-cluster-card__start"
          onClick={handleStart}
          disabled={busy}
        >
          {t('vocabulary.clusters.start')}
        </button>
        <button
          type="button"
          className="vocab-cluster-card__dismiss"
          onClick={handleDismiss}
          disabled={busy}
        >
          {t('common.dismiss')}
        </button>
      </div>
    </div>
  )
}
