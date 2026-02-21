import { useState, useCallback } from 'react'
import {
  getReviewQueue,
  submitReview,
  type ReviewCardDto,
  type SubmitReviewResponse,
} from '../api/vocabulary'

interface SessionStats {
  total: number
  correct: number
  reviewed: number
}

export function useVocabularyReview() {
  const [cards, setCards] = useState<ReviewCardDto[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalDue, setTotalDue] = useState(0)
  const [sessionStats, setSessionStats] = useState<SessionStats>({ total: 0, correct: 0, reviewed: 0 })
  const [lastResult, setLastResult] = useState<SubmitReviewResponse | null>(null)
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)

  const startSession = useCallback(async (limit?: number) => {
    setLoading(true)
    setError(null)
    setCurrentIndex(0)
    setSessionStats({ total: 0, correct: 0, reviewed: 0 })
    setLastResult(null)
    setLastAnswerCorrect(false)
    setAnswerRevealed(false)
    try {
      const queue = await getReviewQueue(limit)
      setCards(queue.cards)
      setTotalDue(queue.totalDue)
      setSessionStats(prev => ({ ...prev, total: queue.cards.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review')
    } finally {
      setLoading(false)
    }
  }, [])

  const submitAnswer = useCallback(async (isCorrect: boolean, responseTimeMs: number) => {
    const card = cards[currentIndex]
    if (!card) return

    try {
      const result = await submitReview({
        wordId: card.wordId,
        isCorrect,
        responseTimeMs,
      })
      setLastResult(result)
      setLastAnswerCorrect(isCorrect)
      setAnswerRevealed(true)
      setSessionStats(prev => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    }
  }, [cards, currentIndex])

  const nextCard = useCallback(() => {
    setCurrentIndex(prev => prev + 1)
    setLastResult(null)
    setLastAnswerCorrect(false)
    setAnswerRevealed(false)
  }, [])

  const currentCard = cards[currentIndex] || null
  const isSessionComplete = currentIndex >= cards.length && cards.length > 0
  const hasCards = cards.length > 0

  return {
    cards,
    currentCard,
    currentIndex,
    totalDue,
    loading,
    error,
    sessionStats,
    lastResult,
    lastAnswerCorrect,
    answerRevealed,
    isSessionComplete,
    hasCards,
    startSession,
    submitAnswer,
    nextCard,
  }
}
