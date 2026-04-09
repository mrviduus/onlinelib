import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

interface MicroPracticeCardProps {
  word: string
  options: string[]
  correctOptionIndex: number
  feedbackState: 'correct' | 'incorrect' | null
  onAnswer: (idx: number) => void
  onClose: () => void
}

export function MicroPracticeCard({
  word,
  options,
  correctOptionIndex,
  feedbackState,
  onAnswer,
  onClose,
}: MicroPracticeCardProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null

  const handleSelect = (idx: number) => {
    if (answered) return
    setSelected(idx)
    onAnswer(idx)
  }

  const getOptionClass = (idx: number) => {
    const base = 'micro-practice__option'
    if (!answered) return base
    if (idx === correctOptionIndex) return `${base} ${base}--correct`
    if (idx === selected) return `${base} ${base}--incorrect`
    return `${base} ${base}--dimmed`
  }

  return (
    <div className="micro-practice" onClick={answered ? onClose : undefined}>
      <div className="micro-practice__card" onClick={e => e.stopPropagation()}>
        <h2 className="micro-practice__word">{word}</h2>
        <p className="micro-practice__prompt">{t('onboarding.practicePrompt')}</p>

        <div className="micro-practice__options">
          {options.map((option, idx) => (
            <button
              key={idx}
              className={getOptionClass(idx)}
              onClick={() => handleSelect(idx)}
              disabled={answered}
            >
              {option}
            </button>
          ))}
        </div>

        {feedbackState && (
          <div className={`micro-practice__feedback micro-practice__feedback--${feedbackState}`}>
            {feedbackState === 'correct' ? t('onboarding.correct') : t('onboarding.incorrect')}
            {feedbackState === 'incorrect' && (
              <p className="micro-practice__feedback-answer">
                {t('onboarding.correctAnswer').replace('{answer}', options[correctOptionIndex])}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
