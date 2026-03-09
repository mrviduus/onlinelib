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

export function SessionSummary({ reviewed, correct, mode, t, onBack, onPracticeAgain, onStartSrs, dueCount }: Props) {
  const rate = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0

  return (
    <div className="review-summary">
      <div className="review-summary__icon">🎉</div>
      <h2>{t('vocabulary.review.sessionComplete')}</h2>
      {mode === 'practice' && (
        <p className="review-summary__note">{t('vocabulary.review.practiceNote')}</p>
      )}
      <div className="review-summary__stats">
        <div className="review-summary__stat">
          <span className="review-summary__value">{reviewed}</span>
          <span className="review-summary__label">{t('vocabulary.review.reviewed')}</span>
        </div>
        <div className="review-summary__stat">
          <span className="review-summary__value">{rate}%</span>
          <span className="review-summary__label">{t('vocabulary.review.correctRate')}</span>
        </div>
      </div>
      <div className="review-summary__actions">
        <button className="review-summary__btn" onClick={onPracticeAgain}>
          {mode === 'practice' ? t('vocabulary.review.practiceAgain') : t('vocabulary.review.keepPracticing')}
        </button>
        {mode === 'practice' && dueCount != null && dueCount > 0 && onStartSrs && (
          <button className="review-summary__btn review-summary__btn--secondary" onClick={onStartSrs}>
            {t('vocabulary.review.reviewDue')} ({dueCount})
          </button>
        )}
        <button className="review-summary__btn review-summary__btn--secondary" onClick={onBack}>
          {t('vocabulary.review.backToVocab')}
        </button>
      </div>
    </div>
  )
}
