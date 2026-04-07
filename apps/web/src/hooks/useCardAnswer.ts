import { useState, useCallback } from 'react'

export function useCardAnswer(
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void,
  disabled?: boolean,
) {
  const [submitted, setSubmitted] = useState(false)
  const [startTime] = useState(Date.now())

  const submitChoice = useCallback((isCorrect: boolean) => {
    if (submitted || disabled) return
    setSubmitted(true)
    onAnswer(isCorrect, Date.now() - startTime)
  }, [submitted, disabled, onAnswer, startTime])

  return { submitted, submitChoice }
}
