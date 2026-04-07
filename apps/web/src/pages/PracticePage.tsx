import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getVocabStats } from '../api/vocabulary'
import type { ReviewMode } from '../hooks/useVocabularyReview'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { EmptyState } from '../components/EmptyState'

export function PracticePage() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  const [dueCount, setDueCount] = useState(0)
  const [totalWords, setTotalWords] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('blitz')

  useEffect(() => {
    if (!isAuthenticated) return
    getVocabStats()
      .then((s) => {
        setDueCount(s.dueNow)
        setTotalWords(s.totalWords)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <SeoHead title={t('practice.title')} noindex />
        <EmptyState icon="📚" title={t('vocabulary.signInPrompt')} />
        <Footer />
      </div>
    )
  }

  const buildReviewUrl = (sessionMode: 'srs' | 'practice') => {
    const params = new URLSearchParams()
    if (sessionMode === 'practice') params.set('mode', 'practice')
    if (reviewMode === 'classic') params.set('reviewMode', 'classic')
    const qs = params.toString()
    return getLocalizedPath(`/words/review${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="page-container">
      <SeoHead title={t('practice.title')} noindex />
      <div className="practice-page">
        <h1>{t('practice.title')}</h1>

        <div className="practice-mode-selector">
          {(['blitz', 'classic'] as const).map(m => (
            <button
              key={m}
              className={`practice-mode-selector__btn ${reviewMode === m ? 'practice-mode-selector__btn--active' : ''}`}
              onClick={() => setReviewMode(m)}
            >
              {t(`vocabulary.review.${m}`)}
            </button>
          ))}
        </div>

        <div className="practice-section">
          <h2 className="practice-section__title">{t('practice.vocabReview')}</h2>
          <p className="practice-section__desc">
            {loading ? '...' : dueCount > 0
              ? t('practice.wordsDue').replace('{count}', String(dueCount))
              : t('practice.noWordsDue')
            }
          </p>
          <div className="practice-section__actions">
            <button
              className="practice-section__btn"
              onClick={() => navigate(buildReviewUrl('srs'))}
              disabled={loading || dueCount === 0}
            >
              {t('practice.startReview')}
            </button>
            {totalWords > 0 && (
              <button
                className="practice-section__btn practice-section__btn--secondary"
                onClick={() => navigate(buildReviewUrl('practice'))}
              >
                {t('practice.practiceMode')}
              </button>
            )}
          </div>
        </div>

        <div className="practice-section">
          <h2 className="practice-section__title">{t('practice.highlightReview')}</h2>
          <p className="practice-section__desc">{t('practice.highlightDesc')}</p>
          <div className="practice-section__actions">
            <button
              className="practice-section__btn"
              onClick={() => navigate(getLocalizedPath('/highlights/review'))}
            >
              {t('practice.startReview')}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
