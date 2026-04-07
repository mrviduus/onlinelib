import { useState } from 'react'
import type { ReviewCardDto } from '../../api/vocabulary'
import { useCardAnswer } from '../../hooks/useCardAnswer'
import { SpeakButton } from './SpeakButton'

function optionClass(idx: number, selected: number | null, correctIdx: number | null): string {
  const base = 'review-mc__option'
  if (selected === null) return base
  if (idx === correctIdx) return `${base} ${base}--correct`
  if (idx === selected) return `${base} ${base}--wrong`
  return `${base} ${base}--dimmed`
}

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
  onSpeak?: (text: string) => void
  t: (key: string) => string
  disabled?: boolean
}

export function MultipleChoiceCard({ card, onAnswer, onSpeak, t, disabled }: Props) {
  const { submitted, submitChoice } = useCardAnswer(onAnswer, disabled)
  const [selected, setSelected] = useState<number | null>(null)

  if (!card.options) return null

  const handleSelect = (idx: number) => {
    if (submitted) return
    setSelected(idx)
    submitChoice(idx === card.correctOptionIndex)
  }

  const prompt = card.blankSentence || card.definition || card.translation
  const isCloze = !!card.blankSentence

  return (
    <div className="review-mc">
      <div className="review-mc__card">
        <div className="review-mc__prompt-row">
          {onSpeak && <SpeakButton onClick={() => onSpeak(card.blankSentence || card.word)} size={18} />}
          <span className={`review-mc__prompt ${isCloze ? 'review-mc__prompt--cloze' : ''}`}>
            {prompt}
          </span>
        </div>

        {card.bookTitle && (
          <div className="review-mc__book">{t('vocabulary.review.fromBook').replace('{title}', card.bookTitle)}</div>
        )}

        {card.hint && (
          <div className="review-mc__hint">{card.hint}</div>
        )}
      </div>

      <div className="review-mc__options">
        {card.options.map((option, idx) => (
          <button
            key={idx}
            className={optionClass(idx, selected, card.correctOptionIndex)}
            onClick={() => handleSelect(idx)}
            disabled={submitted}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
