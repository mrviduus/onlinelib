import { useState, useRef } from 'react'
import { fuzzyMatch } from '../../lib/fuzzyMatch'
import type { ReviewCardDto } from '../../api/vocabulary'
import { SpeakButton } from './SpeakButton'

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
  onSpeak?: (text: string) => void
  t: (key: string) => string
}

export function TypedRecallCard({ card, onAnswer, onSpeak, t }: Props) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [startTime] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (!input.trim() || submitted) return
    setSubmitted(true)
    const { match } = fuzzyMatch(input, card.word)
    onAnswer(match, Date.now() - startTime)
  }

  return (
    <div className="review-typed">
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
          ref={inputRef}
          type="text"
          className="review-typed__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={submitted}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
        />
        <button
          className="review-typed__submit"
          onClick={handleSubmit}
          disabled={submitted || !input.trim()}
        >
          {t('vocabulary.review.check')}
        </button>
      </div>
    </div>
  )
}
