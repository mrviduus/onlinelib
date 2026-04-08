import { useState, useCallback } from 'react'
import {
  getReviewQueue,
  submitReview,
  type ReviewCardDto,
  type SelfAssessment,
  type SubmitReviewResponse,
} from '../api/vocabulary'
import { type ReviewMode } from '../lib/vocabularyConstants'

export type { ReviewMode }

interface SessionStats {
  total: number
  correct: number
  reviewed: number
}

const EMPTY_STATS: SessionStats = { total: 0, correct: 0, reviewed: 0 }

export function useVocabularyReview() {
  const [cards, setCards] = useState<ReviewCardDto[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalDue, setTotalDue] = useState(0)
  const [sessionStats, setSessionStats] = useState<SessionStats>(EMPTY_STATS)
  const [lastResult, setLastResult] = useState<SubmitReviewResponse | null>(null)
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('blitz')
  const [showingNewWord, setShowingNewWord] = useState(false)
  const [wrongCards, setWrongCards] = useState<ReviewCardDto[]>([])

  const resetAnswerState = useCallback(() => {
    setLastResult(null)
    setLastAnswerCorrect(false)
    setAnswerRevealed(false)
    setShowingNewWord(false)
  }, [])

  const showNewWordIfNeeded = useCallback((cardsList: ReviewCardDto[], idx: number) => {
    if (idx < cardsList.length && cardsList[idx].isNew) {
      setShowingNewWord(true)
    }
  }, [])

  const startSession = useCallback(async (limit?: number, rMode?: ReviewMode, includeAll?: boolean) => {
    if (rMode) setReviewMode(rMode)
    setLoading(true)
    setError(null)
    setCurrentIndex(0)
    setWrongCards([])
    resetAnswerState()
    try {
      const queue = await getReviewQueue(limit, includeAll ?? true)
      setCards(queue.cards)
      setTotalDue(queue.totalDue)
      setSessionStats({ ...EMPTY_STATS, total: queue.cards.length })
      showNewWordIfNeeded(queue.cards, 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review')
    } finally {
      setLoading(false)
    }
  }, [resetAnswerState, showNewWordIfNeeded])

  const dismissNewWord = useCallback(() => {
    setShowingNewWord(false)
  }, [])

  const submitAnswer = useCallback(async (
    isCorrect: boolean,
    responseTimeMs: number,
    selfAssessment?: SelfAssessment,
  ) => {
    const card = cards[currentIndex]
    if (!card || submitting) return

    setSubmitting(true)
    try {
      const result = await submitReview({
        wordId: card.wordId,
        isCorrect,
        responseTimeMs,
        selfAssessment,
      })
      setLastResult(result)
      setLastAnswerCorrect(isCorrect)
      setAnswerRevealed(true)
      setSessionStats(prev => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
      }))
      if (!isCorrect) {
        setWrongCards(prev => {
          if (prev.some(c => c.wordId === card.wordId)) return prev
          return [...prev, card]
        })
      }
      window.dispatchEvent(new Event('vocab-review-submitted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }, [cards, currentIndex, submitting])

  const nextCard = useCallback(() => {
    const nextIdx = currentIndex + 1
    setCurrentIndex(nextIdx)
    resetAnswerState()
    showNewWordIfNeeded(cards, nextIdx)
  }, [currentIndex, cards, resetAnswerState, showNewWordIfNeeded])

  const retryWrong = useCallback(() => {
    if (wrongCards.length === 0) return
    const retryCards = wrongCards.map(c => ({ ...c, isNew: false }))
    setCards(retryCards)
    setCurrentIndex(0)
    setWrongCards([])
    setSessionStats(prev => ({ ...prev, total: prev.total + retryCards.length }))
    resetAnswerState()
    showNewWordIfNeeded(retryCards, 0)
  }, [wrongCards, resetAnswerState, showNewWordIfNeeded])

  const currentCard = cards[currentIndex] || null
  const isSessionComplete = currentIndex >= cards.length && cards.length > 0
  const hasCards = cards.length > 0

  return {
    cards,
    currentCard,
    currentIndex,
    totalDue,
    loading,
    submitting,
    error,
    sessionStats,
    lastResult,
    lastAnswerCorrect,
    answerRevealed,
    isSessionComplete,
    hasCards,
    reviewMode,
    showingNewWord,
    wrongCards,
    startSession,
    submitAnswer,
    nextCard,
    dismissNewWord,
    setReviewMode,
    retryWrong,
  }
}
