import { useState } from 'react'
import type { ReviewCardDto } from '../../api/vocabulary'
import { SpeakButton } from './SpeakButton'

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
  onSpeak?: (text: string) => void
  t: (key: string) => string
  disabled?: boolean
}

export function MultipleChoiceCard({ card, onAnswer, onSpeak, t, disabled }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [startTime] = useState(Date.now())

  if (!card.options) return null

  const handleSelect = (idx: number) => {
    if (selected !== null || disabled) return
    setSelected(idx)
    const isCorrect = idx === card.correctOptionIndex
    onAnswer(isCorrect, Date.now() - startTime)
  }

  const prompt = card.definition || card.translation
  const usingSentenceAsPrompt = !prompt && !!card.blankSentence

  return (
    <div className="review-mc">
      {card.originalSentence && !usingSentenceAsPrompt && (
        <div className="review-mc__sentence">
          <strong>"{card.originalSentence}"</strong>
          {card.bookTitle && <span className="review-mc__book"> — {card.bookTitle}</span>}
        </div>
      )}
      <div className="review-mc__prompt">
        {onSpeak && <SpeakButton onClick={() => onSpeak(prompt || card.blankSentence || card.word)} size={14} className="review-card__speak" />}
        {prompt || card.blankSentence}
      </div>
      {card.hint && (
        <div className="review-card__hint">{card.hint}</div>
      )}
      {(usingSentenceAsPrompt || !card.originalSentence) && card.bookTitle && (
        <div className="review-mc__book">{t('vocabulary.review.fromBook').replace('{title}', card.bookTitle!)}</div>
      )}
      <div className="review-mc__options">
        {card.options.map((option, idx) => {
          let cls = 'review-mc__option'
          if (selected !== null) {
            if (idx === card.correctOptionIndex) cls += ' review-mc__option--correct'
            else if (idx === selected) cls += ' review-mc__option--wrong'
          }
          return (
            <button
              key={idx}
              className={cls}
              onClick={() => handleSelect(idx)}
              disabled={selected !== null}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
