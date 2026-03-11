import { useState, useCallback } from 'react'
import { fuzzyMatch } from '../lib/fuzzyMatch'

export function useCardAnswer(
  word: string,
  onAnswer: (isCorrect: boolean, responseTimeMs: number) => void,
  disabled?: boolean,
) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [startTime] = useState(Date.now())

  const elapsed = () => Date.now() - startTime

  const submitTyped = useCallback(() => {
    if (!input.trim() || submitted || disabled) return
    setSubmitted(true)
    const { match } = fuzzyMatch(input, word)
    onAnswer(match, elapsed())
  }, [input, submitted, disabled, word, onAnswer]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitChoice = useCallback((isCorrect: boolean) => {
    if (submitted || disabled) return
    setSubmitted(true)
    onAnswer(isCorrect, elapsed())
  }, [submitted, disabled, onAnswer]) // eslint-disable-line react-hooks/exhaustive-deps

  return { input, setInput, submitted, submitTyped, submitChoice }
}
