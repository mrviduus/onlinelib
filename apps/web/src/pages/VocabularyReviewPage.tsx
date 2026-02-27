import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { useVocabularyReview } from '../hooks/useVocabularyReview'
import { useTts } from '../hooks/useTts'
import { MultipleChoiceCard } from '../components/vocabulary/MultipleChoiceCard'
import { TypedRecallCard } from '../components/vocabulary/TypedRecallCard'
import { ContextCard } from '../components/vocabulary/ContextCard'
import { ReviewFeedback } from '../components/vocabulary/ReviewFeedback'
import { SessionSummary } from '../components/vocabulary/SessionSummary'

export function VocabularyReviewPage() {
  const { user } = useAuth()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    currentCard,
    currentIndex,
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
    cards,
  } = useVocabularyReview()
  const { speak } = useTts()
  const handleSpeak = (text: string) => speak(text, language)

  useEffect(() => {
    if (user) startSession(20)
  }, [user, startSession])

  if (!user) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{t('vocabulary.signInPrompt')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{t('common.loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{error}</p>
      </div>
    )
  }

  if (!hasCards) {
    return (
      <div className="vocab-page">
        <div className="vocab-empty">
          <p>{t('vocabulary.noReviewDue')}</p>
          <button
            className="vocab-review-btn"
            style={{ marginTop: '1rem' }}
            onClick={() => navigate(`/${language}/vocabulary`)}
          >
            {t('vocabulary.review.backToVocab')}
          </button>
        </div>
      </div>
    )
  }

  if (isSessionComplete) {
    return (
      <div className="vocab-page">
        <SessionSummary
          reviewed={sessionStats.reviewed}
          correct={sessionStats.correct}
          t={t}
          onBack={() => navigate(`/${language}/vocabulary`)}
        />
      </div>
    )
  }

  return (
    <div className="vocab-page">
      <div className="review-progress">
        <div className="review-progress__bar">
          <div
            className="review-progress__fill"
            style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
          />
        </div>
        <span className="review-progress__text">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {currentCard && !answerRevealed && (
        <>
          {currentCard.reviewMode === 'multiple_choice' && (
            <MultipleChoiceCard card={currentCard} onAnswer={submitAnswer} onSpeak={handleSpeak} t={t} />
          )}
          {currentCard.reviewMode === 'typed_recall' && (
            <TypedRecallCard card={currentCard} onAnswer={submitAnswer} onSpeak={handleSpeak} t={t} />
          )}
          {currentCard.reviewMode === 'context' && (
            <ContextCard card={currentCard} onAnswer={submitAnswer} onSpeak={handleSpeak} t={t} />
          )}
        </>
      )}

      {currentCard && answerRevealed && lastResult && (
        <ReviewFeedback
          card={currentCard}
          result={lastResult}
          isCorrect={lastAnswerCorrect}
          onSpeak={handleSpeak}
          t={t}
          onNext={nextCard}
        />
      )}
    </div>
  )
}
