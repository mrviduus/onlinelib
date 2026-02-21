import type { ReviewCardDto, SubmitReviewResponse } from '../../api/vocabulary'

interface Props {
  card: ReviewCardDto
  result: SubmitReviewResponse
  isCorrect: boolean
  t: (key: string) => string
  onNext: () => void
}

const STAGE_NAMES = ['New', 'Recognition', 'Recall', 'Context', 'Mastered']

export function ReviewFeedback({ card, result, isCorrect, t, onNext }: Props) {

  return (
    <div className={`review-feedback ${isCorrect ? 'review-feedback--correct' : 'review-feedback--wrong'}`}>
      <div className="review-feedback__icon">
        {isCorrect ? '✓' : '✗'}
      </div>
      <div className="review-feedback__message">
        {isCorrect ? t('vocabulary.review.correct') : t('vocabulary.review.wrong')}
      </div>

      {!isCorrect && (
        <div className="review-feedback__answer">
          <span className="review-feedback__label">{t('vocabulary.review.correctAnswer')}:</span>
          <span className="review-feedback__word">{card.word}</span>
          {card.translation && (
            <span className="review-feedback__translation">= {card.translation}</span>
          )}
        </div>
      )}

      {card.originalSentence && (
        <div className="review-feedback__sentence">
          "{card.originalSentence}"
          {card.bookTitle && <span className="review-feedback__book"> — {card.bookTitle}</span>}
        </div>
      )}

      {result.stageChanged && (
        <div className="review-feedback__stage">
          {STAGE_NAMES[result.previousStage]} → {STAGE_NAMES[result.newStage]}
        </div>
      )}

      <button className="review-feedback__next" onClick={onNext}>
        {t('vocabulary.review.next')}
      </button>
    </div>
  )
}
