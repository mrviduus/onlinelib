import { useState } from 'react'
import { fuzzyMatch } from '../../lib/fuzzyMatch'
import type { ReviewCardDto } from '../../api/vocabulary'

interface Props {
  card: ReviewCardDto
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void
  t: (key: string) => string
}

export function ContextCard({ card, onAnswer, t }: Props) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [startTime] = useState(Date.now())

  const handleSubmit = () => {
    if (!input.trim() || submitted) return
    setSubmitted(true)
    const { match } = fuzzyMatch(input, card.word)
    onAnswer(match, Date.now() - startTime)
  }

  return (
    <div className="review-context">
      <div className="review-context__sentence">
        {card.blankSentence || card.originalSentence}
      </div>
      {card.bookTitle && (
        <div className="review-context__book">— {card.bookTitle}</div>
      )}
      <div className="review-context__label">{t('vocabulary.review.fillBlank')}</div>
      <div className="review-context__input-row">
        <input
          type="text"
          className="review-context__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={submitted}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
        />
        <button
          className="review-context__submit"
          onClick={handleSubmit}
          disabled={submitted || !input.trim()}
        >
          {t('vocabulary.review.check')}
        </button>
      </div>
    </div>
  )
}
