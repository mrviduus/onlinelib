import type { ReviewCardDto, SubmitReviewResponse } from '../../api/vocabulary'
import { SpeakButton } from './SpeakButton'

interface Props {
  card: ReviewCardDto
  result: SubmitReviewResponse
  isCorrect: boolean
  onSpeak?: (text: string) => void
  t: (key: string) => string
  onNext: () => void
}

export function ReviewFeedback({ card, result, isCorrect, onSpeak, t, onNext }: Props) {
  const stageName = (stage: number) => t(`vocabulary.stages.${stage}`) || `Stage ${stage}`

  return (
    <div className={`review-feedback ${isCorrect ? 'review-feedback--correct' : 'review-feedback--wrong'}`}>
      <div className="review-feedback__icon" aria-hidden="true">
        {isCorrect ? '✓' : '✗'}
      </div>
      <div className="review-feedback__message">
        {onSpeak && <SpeakButton onClick={() => onSpeak(card.word)} size={18} className="review-card__speak" />}
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

      {card.definition && (
        <div className="review-card__definition">{card.definition}</div>
      )}

      {result.stageChanged && (
        <div className="review-feedback__stage">
          {stageName(result.previousStage)} → {stageName(result.newStage)}
        </div>
      )}

      <button className="review-feedback__next" onClick={onNext}>
        {t('vocabulary.review.next')}
      </button>
    </div>
  )
}
