interface Props {
  reviewed: number
  correct: number
  t: (key: string) => string
  onBack: () => void
}

export function SessionSummary({ reviewed, correct, t, onBack }: Props) {
  const rate = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0

  return (
    <div className="review-summary">
      <div className="review-summary__icon">🎉</div>
      <h2>{t('vocabulary.review.sessionComplete')}</h2>
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
      <button className="review-summary__btn" onClick={onBack}>
        {t('vocabulary.review.backToVocab')}
      </button>
    </div>
  )
}
