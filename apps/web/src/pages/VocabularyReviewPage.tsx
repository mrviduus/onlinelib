import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import type { SelfAssessment } from '../api/vocabulary'
import { useVocabularyReview, type ReviewMode } from '../hooks/useVocabularyReview'
import { useTts } from '../hooks/useTts'
import { useSoundEffects } from '../hooks/useSoundEffects'
import { MultipleChoiceCard } from '../components/vocabulary/MultipleChoiceCard'
import { FlashCard } from '../components/vocabulary/FlashCard'
import { NewWordCard } from '../components/vocabulary/NewWordCard'
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
  const initialReviewMode = (searchParams.get('reviewMode') as ReviewMode) || 'blitz'
  const batchSize = useMemo(() => {
    const v = parseInt(searchParams.get('limit') || '20', 10)
    return [10, 20, 50].includes(v) ? v : 20
  }, [searchParams])

  const review = useVocabularyReview()
  const { speak } = useTts()
  const { play: playSound, toggle: toggleSound, isEnabled: isSoundEnabled } = useSoundEffects()
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())
  const handleSpeak = (text: string) => speak(text, language)
  const goToWords = () => navigate(`/${language}/words`)

  useEffect(() => {
    if (user) review.startSession(batchSize, sessionMode, initialReviewMode)
  }, [user, batchSize, sessionMode, initialReviewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = (isCorrect: boolean, responseTimeMs: number, selfAssessment?: SelfAssessment) => {
    playSound(isCorrect ? 'correct' : 'wrong')
    review.submitAnswer(isCorrect, responseTimeMs, selfAssessment)
  }

  const handleToggleSound = () => setSoundOn(toggleSound())

  useEffect(() => {
    if (review.isSessionComplete) playSound('complete')
  }, [review.isSessionComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{t('vocabulary.signInPrompt')}</p>
      </div>
    )
  }

  if (review.loading) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{t('common.loading')}</p>
      </div>
    )
  }

  if (review.error) {
    return (
      <div className="vocab-page">
        <p className="vocab-loading">{review.error}</p>
      </div>
    )
  }

  if (!review.hasCards) {
    return (
      <div className="vocab-page">
        <EmptyState
          icon="📝"
          title={review.mode === 'practice' ? t('vocabulary.review.noPracticeWords') : t('vocabulary.noReviewDue')}
          buttonLabel={t('vocabulary.review.backToVocab')}
          onButtonClick={goToWords}
        />
      </div>
    )
  }

  if (review.isSessionComplete) {
    return (
      <div className="vocab-page">
        <SessionSummary
          reviewed={review.sessionStats.reviewed}
          correct={review.sessionStats.correct}
          mode={review.mode}
          t={t}
          onBack={goToWords}
          onPracticeAgain={() => review.startSession(batchSize, 'practice', review.reviewMode)}
          onStartSrs={() => review.startSession(batchSize, 'srs', review.reviewMode)}
          dueCount={review.totalDue}
        />
      </div>
    )
  }

  const { currentCard, currentIndex, cards, reviewMode, showingNewWord, answerRevealed, lastResult, lastAnswerCorrect, submitting, mode } = review

  return (
    <div className="vocab-page">
      <div className="review-header">
        {mode === 'practice' && (
          <span className="review-mode-badge">{t('vocabulary.review.practiceMode')}</span>
        )}
        <button className="review-sound-toggle" onClick={handleToggleSound} title={soundOn ? t('vocabulary.review.soundOff') : t('vocabulary.review.soundOn')}>
          <SoundIcon on={soundOn} />
        </button>
      </div>

      <div className="review-progress">
        <div className="review-progress__bar">
          <div
            className="review-progress__fill"
            style={{ width: `${(currentIndex / cards.length) * 100}%` }}
          />
        </div>
        <span className="review-progress__text">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {currentCard && showingNewWord && (
        <NewWordCard card={currentCard} onContinue={review.dismissNewWord} onSpeak={handleSpeak} t={t} />
      )}

      {currentCard && !showingNewWord && !answerRevealed && (
        reviewMode === 'classic' ? (
          <FlashCard
            card={currentCard}
            onAnswer={handleAnswer}
            onSpeak={handleSpeak}
            onFlip={() => playSound('flip')}
            t={t}
            disabled={submitting}
          />
        ) : (
          <MultipleChoiceCard
            card={currentCard}
            onAnswer={handleAnswer}
            onSpeak={handleSpeak}
            t={t}
            disabled={submitting}
          />
        )
      )}

      {currentCard && answerRevealed && lastResult && (
        reviewMode === 'classic' ? (
          <div className="review-feedback-mini">
            <div className={`review-feedback-mini__badge review-feedback-mini__badge--${lastAnswerCorrect ? 'correct' : 'wrong'}`}>
              {lastAnswerCorrect ? t('vocabulary.review.correct') : t('vocabulary.review.wrong')}
            </div>
            {lastResult.stageChanged && (
              <span className="review-feedback-mini__stage">
                {t(`vocabulary.stages.${lastResult.previousStage}`)} → {t(`vocabulary.stages.${lastResult.newStage}`)}
              </span>
            )}
            <button className="review-feedback__next" onClick={review.nextCard}>
              {t('vocabulary.review.next')}
            </button>
          </div>
        ) : (
          <ReviewFeedback
            card={currentCard}
            result={lastResult}
            isCorrect={lastAnswerCorrect}
            onSpeak={handleSpeak}
            t={t}
            onNext={review.nextCard}
            language={language}
          />
        )
      )}
    </div>
  )
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {on ? (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      ) : (
        <line x1="23" y1="9" x2="17" y2="15" />
      )}
    </svg>
  )
}
