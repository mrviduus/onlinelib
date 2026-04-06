import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getVocabStats } from '../api/vocabulary'
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
        <EmptyState icon="🎯" title={t('vocabulary.signInPrompt')} />
        <Footer />
      </div>
    )
  }

  return (
    <div className="page-container">
      <SeoHead title={t('practice.title')} noindex />
      <div className="practice-page">
        <h1>{t('practice.title')}</h1>

        <div className="practice-page__cards">
          {/* Vocabulary Review */}
          <div className="practice-card">
            <div className="practice-card__icon">📝</div>
            <h2 className="practice-card__title">{t('practice.vocabReview')}</h2>
            <p className="practice-card__desc">
              {loading ? '...' : dueCount > 0
                ? t('practice.wordsDue').replace('{count}', String(dueCount))
                : t('practice.noWordsDue')
              }
            </p>
            <button
              className="practice-card__btn"
              onClick={() => navigate(getLocalizedPath('/words/review'))}
              disabled={loading || dueCount === 0}
            >
              {t('practice.startReview')}
            </button>
            {totalWords > 0 && (
              <button
                className="practice-card__btn practice-card__btn--secondary"
                onClick={() => navigate(getLocalizedPath('/words/review?mode=practice'))}
              >
                {t('practice.practiceMode')}
              </button>
            )}
          </div>

          {/* Highlight Review */}
          <div className="practice-card">
            <div className="practice-card__icon">🎨</div>
            <h2 className="practice-card__title">{t('practice.highlightReview')}</h2>
            <p className="practice-card__desc">{t('practice.highlightDesc')}</p>
            <button
              className="practice-card__btn"
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
