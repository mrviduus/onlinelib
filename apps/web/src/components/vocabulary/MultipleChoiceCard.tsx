import { useState } from 'react'
import type { ReviewCardDto } from '../../api/vocabulary'

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
}

export function MultipleChoiceCard({ card, onAnswer }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [startTime] = useState(Date.now())

  if (!card.options) return null

  const handleSelect = (idx: number) => {
    if (selected !== null) return // already answered
    setSelected(idx)
    const isCorrect = idx === card.correctOptionIndex
    onAnswer(isCorrect, Date.now() - startTime)
  }

  const prompt = card.definition || card.translation || card.blankSentence

  return (
    <div className="review-mc">
      <div className="review-mc__prompt">{prompt}</div>
      {card.bookTitle && (
        <div className="review-mc__book">from "{card.bookTitle}"</div>
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
