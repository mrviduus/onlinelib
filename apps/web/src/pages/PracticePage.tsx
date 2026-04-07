import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getVocabStats, type VocabStatsDto } from '../api/vocabulary'
import { REVIEW_BATCH_SIZES, DEFAULT_BATCH_SIZE, type ReviewMode } from '../lib/vocabularyConstants'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'

export function PracticePage() {
  const { isAuthenticated } = useAuth()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [stats, setStats] = useState<VocabStatsDto | null>(null)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('blitz')
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    getVocabStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  const dueCount = stats?.dueNow ?? 0

  const handleStart = () => {
    const params = new URLSearchParams()
    params.set('reviewMode', reviewMode)
    if (batchSize !== DEFAULT_BATCH_SIZE) params.set('limit', String(batchSize))
    navigate(getLocalizedPath('/words/review') + '?' + params.toString())
  }

  return (
    <div className="page-container">
      <SeoHead title={t('nav.practice')} noindex />
      <div className="practice-page">
        <h1>{t('nav.practice')}</h1>

        {!isAuthenticated && (
          <p className="vocab-loading">{t('vocabulary.signInPrompt')}</p>
        )}

        {isAuthenticated && loading && (
          <p className="vocab-loading">{t('common.loading')}</p>
        )}

        {isAuthenticated && !loading && (
          <>
            {/* Stats summary */}
            {stats && (
              <div className="practice-page__stats">
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value">{stats.totalWords}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.totalWords')}</span>
                </div>
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value practice-page__stat-value--primary">{dueCount}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.dueToday')}</span>
                </div>
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value">{stats.byStage.mastered}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.mastered')}</span>
                </div>
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value">{stats.streak}d</span>
                  <span className="practice-page__stat-label">{t('vocabulary.stats.streak')}</span>
                </div>
              </div>
            )}

            {/* Start practice card */}
            <div className="practice-page__card">
              <div className="practice-page__settings">
                <div className="practice-page__setting">
                  <span className="practice-page__setting-label">Mode</span>
                  <div className="vocab-mode-toggle">
                    {(['blitz', 'classic'] as ReviewMode[]).map(m => (
                      <button
                        key={m}
                        className={`vocab-mode-toggle__btn ${reviewMode === m ? 'vocab-mode-toggle__btn--active' : ''}`}
                        onClick={() => setReviewMode(m)}
                      >
                        {m === 'blitz' ? 'Blitz' : 'Flashcards'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="practice-page__setting">
                  <span className="practice-page__setting-label">Length</span>
                  <div className="review-summary__batch-row">
                    {REVIEW_BATCH_SIZES.map(n => (
                      <button
                        key={n}
                        className={`review-summary__batch-chip ${batchSize === n ? 'review-summary__batch-chip--active' : ''}`}
                        onClick={() => setBatchSize(n)}
                      >
                        {n} words
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                className="practice-page__start-btn"
                onClick={handleStart}
                disabled={dueCount === 0}
              >
                {dueCount > 0
                  ? `${t('vocabulary.startPractice')} (${Math.min(batchSize, dueCount)} words)`
                  : t('vocabulary.noReviewDue')
                }
              </button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
