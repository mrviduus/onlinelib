interface Props {
  reviewed: number
  correct: number
  mode: 'srs' | 'practice'
  t: (key: string) => string
  onBack: () => void
  onPracticeAgain: () => void
  onStartSrs?: () => void
  dueCount?: number
}

function getReward(rate: number, t: (k: string) => string) {
  if (rate === 100) return { tier: 'perfect' as const, message: t('vocabulary.review.perfectSession') }
  if (rate >= 80) return { tier: 'great' as const, message: t('vocabulary.review.excellent') }
  if (rate >= 60) return { tier: 'good' as const, message: t('vocabulary.review.greatWork') }
  return { tier: 'keep' as const, message: t('vocabulary.review.keepPracticingMsg') }
}

export function SessionSummary({ reviewed, correct, mode, t, onBack, onPracticeAgain, onStartSrs, dueCount }: Props) {
  const rate = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0
  const reward = getReward(rate, t)

  return (
    <div className="review-summary">
      {/* Reward banner */}
      <div className={`review-summary__banner review-summary__banner--${reward.tier}`}>
        <span className="review-summary__banner-message">{reward.message}</span>
      </div>

      {/* Stats */}
      <div className="review-summary__stats-row">
        <span className="review-summary__stat-big">{reviewed}</span>
        <span className="review-summary__stat-label">{t('vocabulary.review.wordsReviewed')}</span>
        <span className="review-summary__stat-divider" />
        <span className="review-summary__stat-big">{rate}%</span>
        <span className="review-summary__stat-label">{t('vocabulary.review.correctRate')}</span>
      </div>

      {mode === 'practice' && (
        <p className="review-summary__note">{t('vocabulary.review.practiceNote')}</p>
      )}

      {/* Actions */}
      <div className="review-summary__actions">
        <button className="review-summary__btn review-summary__btn--primary" onClick={onPracticeAgain}>
          {t('vocabulary.review.startAgain')}
        </button>
        {mode === 'practice' && dueCount != null && dueCount > 0 && onStartSrs && (
          <button className="review-summary__btn review-summary__btn--secondary" onClick={onStartSrs}>
            {t('vocabulary.review.reviewDue')} ({dueCount})
          </button>
        )}
        <button className="review-summary__btn review-summary__btn--link" onClick={onBack}>
          {t('vocabulary.review.backToVocab')}
        </button>
      </div>
    </div>
  )
}
