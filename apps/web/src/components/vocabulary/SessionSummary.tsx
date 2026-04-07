import { REVIEW_BATCH_SIZES, type ReviewMode } from '../../lib/vocabularyConstants'

interface Props {
  reviewed: number
  correct: number
  elapsedMs: number
  reviewMode: ReviewMode
  batchSize: number
  t: (key: string) => string
  onBack: () => void
  onAgain: () => void
  onBatchChange: (size: number) => void
  onModeChange: (mode: ReviewMode) => void
  dueCount?: number
}

function getReward(rate: number, t: (k: string) => string) {
  if (rate === 100) return { tier: 'perfect' as const, message: t('vocabulary.review.perfectSession') }
  if (rate >= 80) return { tier: 'great' as const, message: t('vocabulary.review.excellent') }
  if (rate >= 60) return { tier: 'good' as const, message: t('vocabulary.review.greatWork') }
  return { tier: 'keep' as const, message: t('vocabulary.review.keepPracticingMsg') }
}

function formatTime(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec}s`
}

export function SessionSummary({
  reviewed, correct, elapsedMs, reviewMode, batchSize, t,
  onBack, onAgain, onBatchChange, onModeChange, dueCount,
}: Props) {
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
        <span className="review-summary__stat-divider" />
        <span className="review-summary__stat-big">{formatTime(elapsedMs)}</span>
        <span className="review-summary__stat-label">Time</span>
      </div>

      {/* Review style toggle */}
      <div className="review-summary__section">
        <span className="review-summary__section-label">Mode</span>
        <div className="review-summary__toggle">
          {(['blitz', 'classic'] as ReviewMode[]).map(m => (
            <button
              key={m}
              className={`review-summary__toggle-item ${reviewMode === m ? 'review-summary__toggle-item--active' : ''}`}
              onClick={() => onModeChange(m)}
            >
              {m === 'blitz' ? 'Blitz' : 'Flashcards'}
            </button>
          ))}
        </div>
      </div>

      {/* Batch size */}
      <div className="review-summary__section">
        <span className="review-summary__section-label">Length</span>
        <div className="review-summary__batch-row">
          {REVIEW_BATCH_SIZES.map(n => (
            <button
              key={n}
              className={`review-summary__batch-chip ${batchSize === n ? 'review-summary__batch-chip--active' : ''}`}
              onClick={() => onBatchChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="review-summary__actions">
        <button className="review-summary__btn review-summary__btn--primary" onClick={onAgain}>
          {t('vocabulary.review.startAgain')}
          {dueCount != null && dueCount > 0 ? ` (${dueCount} ${t('vocabulary.dueToday').toLowerCase()})` : ''}
        </button>
        <button className="review-summary__btn review-summary__btn--link" onClick={onBack}>
          {t('vocabulary.review.backToVocab')}
        </button>
      </div>
    </div>
  )
}
