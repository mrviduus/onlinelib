import type { ReviewCardDto } from '../../api/vocabulary'
import { SpeakButton } from './SpeakButton'

interface NewWordCardProps {
  card: ReviewCardDto
  onContinue: () => void
  onSpeak?: (text: string) => void
  t: (key: string) => string
}

export function NewWordCard({ card, onContinue, onSpeak, t }: NewWordCardProps) {
  return (
    <div className="new-word-card">
      <span className="new-word-card__label">{t('vocabulary.review.newWord')}</span>

      <div className="new-word-card__word-row">
        {onSpeak && <SpeakButton onClick={() => onSpeak(card.word)} />}
        <span className="new-word-card__word">{card.word}</span>
      </div>

      {card.originalSentence && (
        <p className="new-word-card__sentence">
          {card.originalSentence}
        </p>
      )}

      {card.translation && (
        <p className="new-word-card__meaning">
          <span className="new-word-card__meaning-label">{t('vocabulary.review.meaning')}:</span>{' '}
          {card.translation}
        </p>
      )}

      {(card.explanation || card.definition) && (
        <p className="new-word-card__explanation">
          {card.explanation || card.definition}
        </p>
      )}

      <button className="new-word-card__continue" onClick={onContinue}>
        {t('vocabulary.review.continue')}
      </button>
    </div>
  )
}
