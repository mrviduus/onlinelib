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

export function ContextCard({ card, onAnswer, onSpeak, t, disabled }: Props) {
  const { input, setInput, submitted, submitTyped } = useCardAnswer(card.word, onAnswer, disabled)

  return (
    <div className="review-context">
      <div className="review-context__sentence">
        {onSpeak && <SpeakButton onClick={() => onSpeak(card.originalSentence || card.word)} size={14} className="review-card__speak" />}
        {card.blankSentence || card.originalSentence}
      </div>
      {card.bookTitle && (
        <div className="review-context__book">— {card.bookTitle}</div>
      )}
      {card.definition && (
        <div className="review-card__definition">{card.definition}</div>
      )}
      {card.hint && (
        <div className="review-card__hint">{card.hint}</div>
      )}
      <div className="review-context__label">{t('vocabulary.review.fillBlank')}</div>
      <div className="review-context__input-row">
        <input
          type="text"
          className="review-context__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitTyped()}
          disabled={submitted || disabled}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          aria-label={t('vocabulary.review.fillBlank')}
        />
        <button
          className="review-context__submit"
          onClick={submitTyped}
          disabled={submitted || disabled || !input.trim()}
        >
          {t('vocabulary.review.check')}
        </button>
      </div>
    </div>
  )
}
