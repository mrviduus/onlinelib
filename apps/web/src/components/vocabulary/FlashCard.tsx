import { useState, useCallback } from 'react'
import type { ReviewCardDto, SelfAssessment } from '../../api/vocabulary'
import { SpeakButton } from './SpeakButton'

const ASSESSMENTS: { key: SelfAssessment; suffix?: string }[] = [
  { key: 'forgot' },
  { key: 'almost' },
  { key: 'knew', suffix: ' ✓' },
]

interface FlashCardProps {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number, selfAssessment: SelfAssessment) => void
  onSpeak?: (text: string) => void
  onFlip?: () => void
  t: (key: string) => string
  disabled?: boolean
}

export function FlashCard({ card, onAnswer, onSpeak, onFlip, t, disabled }: FlashCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [startTime] = useState(() => Date.now())

  const handleFlip = useCallback(() => {
    if (!flipped) {
      setFlipped(true)
      onFlip?.()
    }
  }, [flipped, onFlip])

  const handleAssess = useCallback((assessment: SelfAssessment) => {
    if (disabled) return
    const isCorrect = assessment === 'knew'
    onAnswer(isCorrect, Date.now() - startTime, assessment)
  }, [disabled, onAnswer, startTime])

  return (
    <div className="flash-card-wrapper" onClick={!flipped ? handleFlip : undefined}>
      <div className={`flash-card ${flipped ? 'flash-card--flipped' : ''}`}>
        {/* Front */}
        <div className="flash-card__face flash-card__front">
          <div className="flash-card__word-row">
            {onSpeak && <SpeakButton onClick={() => onSpeak(card.word)} />}
            <span className="flash-card__word">{card.word}</span>
          </div>

          {card.originalSentence && (
            <p className="flash-card__sentence">{card.originalSentence}</p>
          )}

          {card.bookTitle && (
            <p className="flash-card__book">{card.bookTitle}</p>
          )}

          <span className="flash-card__tap-hint">{t('vocabulary.review.tapToFlip')}</span>
        </div>

        {/* Back */}
        <div className="flash-card__face flash-card__back">
          <span className="flash-card__translation">{card.translation || '—'}</span>

          {card.definition && (
            <p className="flash-card__definition">{card.definition}</p>
          )}

          {card.hint && (
            <p className="flash-card__hint">{card.hint}</p>
          )}
        </div>
      </div>

      {flipped && (
        <div className="flash-card__assessment">
          <span className="flash-card__assessment-label">{t('vocabulary.review.didYouRemember')}</span>
          <div className="flash-card__assessment-buttons">
            {ASSESSMENTS.map(({ key, suffix }) => (
              <button
                key={key}
                className={`flash-card__assess flash-card__assess--${key}`}
                onClick={() => handleAssess(key)}
                disabled={disabled}
              >
                {t(`vocabulary.review.${key}`)}
                {suffix}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
