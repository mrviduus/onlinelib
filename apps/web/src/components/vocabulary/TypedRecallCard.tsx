import type { ReviewCardDto } from '../../api/vocabulary'
import { useCardAnswer } from '../../hooks/useCardAnswer'
import { SpeakButton } from './SpeakButton'

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
  onSpeak?: (text: string) => void
  t: (key: string) => string
  disabled?: boolean
}

export function TypedRecallCard({ card, onAnswer, onSpeak, t, disabled }: Props) {
  const { input, setInput, submitted, submitTyped } = useCardAnswer(card.word, onAnswer, disabled)

  return (
    <div className="review-typed">
      {card.originalSentence && (
        <div className="review-typed__sentence">
          "{card.originalSentence}"
          {card.bookTitle && <span className="review-typed__book"> — {card.bookTitle}</span>}
        </div>
      )}
      <div className="review-typed__prompt">
        {onSpeak && <SpeakButton onClick={() => onSpeak(card.definition || card.translation || card.word)} size={14} className="review-card__speak" />}
        {card.definition ? (
          <div className="review-typed__definition">{card.definition}</div>
        ) : card.translation ? (
          <div className="review-typed__translation">{card.translation}</div>
        ) : (
          <div className="review-typed__word-prompt">{card.word}</div>
        )}
      </div>
      {card.hint && (
        <div className="review-card__hint">{card.hint}</div>
      )}
      <div className="review-typed__label">{t('vocabulary.review.typeWord')}</div>
      <div className="review-typed__input-row">
        <input
          type="text"
          className="review-typed__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitTyped()}
          disabled={submitted || disabled}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          aria-label={t('vocabulary.review.typeWord')}
        />
        <button
          className="review-typed__submit"
          onClick={submitTyped}
          disabled={submitted || disabled || !input.trim()}
        >
          {t('vocabulary.review.check')}
        </button>
      </div>
    </div>
  )
}
