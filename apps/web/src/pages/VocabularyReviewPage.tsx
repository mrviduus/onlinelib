import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { useVocabularyReview } from '../hooks/useVocabularyReview'
import { useTts } from '../hooks/useTts'
import { MultipleChoiceCard } from '../components/vocabulary/MultipleChoiceCard'
import { ContextCard } from '../components/vocabulary/ContextCard'
import { ReviewFeedback } from '../components/vocabulary/ReviewFeedback'
import { SessionSummary } from '../components/vocabulary/SessionSummary'
import { EmptyState } from '../components/EmptyState'

export function VocabularyReviewPage() {
  const { user } = useAuth()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionMode = searchParams.get('mode') === 'practice' ? 'practice' as const : 'srs' as const
  const batchSize = useMemo(() => {
    const v = parseInt(searchParams.get('limit') || '20', 10)
    return [10, 20, 50].includes(v) ? v : 20
  }, [searchParams])

  const {
    currentCard,
    currentIndex,
    loading,
    submitting,
    error,
    sessionStats,
    lastResult,
    lastAnswerCorrect,
    answerRevealed,
    isSessionComplete,
    hasCards,
    mode,
    totalDue,
    startSession,
    submitAnswer,
    nextCard,
    cards,
  } = useVocabularyReview()
  const { speak } = useTts()
  const handleSpeak = (text: string) => speak(text, language)

  useEffect(() => {
    if (user) startSession(batchSize, sessionMode)
  }, [user, startSession, sessionMode]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <EmptyState
          icon="📝"
          title={mode === 'practice' ? t('vocabulary.review.noPracticeWords') : t('vocabulary.noReviewDue')}
          buttonLabel={t('vocabulary.review.backToVocab')}
          onButtonClick={() => navigate(`/${language}/words`)}
        />
      </div>
    )
  }

  if (isSessionComplete) {
    return (
      <div className="vocab-page">
        <SessionSummary
          reviewed={sessionStats.reviewed}
          correct={sessionStats.correct}
          mode={mode}
          t={t}
          onBack={() => navigate(`/${language}/words`)}
          onPracticeAgain={() => startSession(batchSize, 'practice')}
          onStartSrs={() => startSession(batchSize, 'srs')}
          dueCount={totalDue}
        />
      </div>
    )
  }

  return (
    <div className="vocab-page">
      {mode === 'practice' && (
        <div className="review-mode-badge">{t('vocabulary.review.practiceMode')}</div>
      )}
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

      {error && !loading && (
        <div className="review-error">{error}</div>
      )}

      {currentCard && !answerRevealed && (
        <>
          {currentCard.reviewMode === 'multiple_choice' && (
            <MultipleChoiceCard card={currentCard} onAnswer={submitAnswer} onSpeak={handleSpeak} t={t} disabled={submitting} />
          )}
          {currentCard.reviewMode === 'context' && (
            <ContextCard card={currentCard} onAnswer={submitAnswer} onSpeak={handleSpeak} t={t} disabled={submitting} />
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
          language={language}
        />
      )}
    </div>
  )
}
