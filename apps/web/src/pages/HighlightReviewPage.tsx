import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getHighlightsForReview, markHighlightReviewed, type HighlightReviewItem } from '../api/userData'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'

export function HighlightReviewPage() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()

  const [cards, setCards] = useState<HighlightReviewItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    setLoading(true)
    getHighlightsForReview(15)
      .then(setCards)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  const currentCard = cards[currentIndex]

  const handleNext = async () => {
    if (!currentCard) return

    try {
      await markHighlightReviewed(currentCard.id)
    } catch { /* ignore */ }

    setReviewedCount(prev => prev + 1)
    setFlipped(false)

    if (currentIndex + 1 >= cards.length) {
      setDone(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }

  if (!isAuthenticated) {
    return (
      <>
        <div className="highlight-review">
          <SeoHead title={t('highlights.reviewButton')} noindex />
          <p>{t('highlights.signInPrompt')}</p>
        </div>
        <Footer />
      </>
    )
  }

  if (loading) {
    return (
      <>
        <div className="highlight-review">
          <SeoHead title={t('highlights.reviewButton')} noindex />
          <div className="highlight-review__loading">{t('common.loading')}</div>
        </div>
        <Footer />
      </>
    )
  }

  if (cards.length === 0) {
    return (
      <>
        <div className="highlight-review">
          <SeoHead title={t('highlights.reviewButton')} noindex />
          <div className="highlight-review__empty">
            <p>{t('highlights.reviewEmpty')}</p>
            <button onClick={() => navigate(getLocalizedPath('/words?tab=highlights'))}>
              {t('highlights.backToHighlights')}
            </button>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (done) {
    return (
      <>
        <div className="highlight-review">
          <SeoHead title={t('highlights.reviewComplete')} noindex />
          <div className="highlight-review__summary">
            <h2>{t('highlights.reviewComplete')}</h2>
            <p>{t('highlights.reviewedCount').replace('{count}', String(reviewedCount))}</p>
            <button
              className="highlight-review__back-btn"
              onClick={() => navigate(getLocalizedPath('/words?tab=highlights'))}
            >
              {t('highlights.backToHighlights')}
            </button>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <div className="highlight-review">
        <SeoHead title={t('highlights.reviewButton')} noindex />

        <div className="highlight-review__progress">
          {currentIndex + 1} / {cards.length}
        </div>

        <div
          className={`highlight-review__card highlight-review__card--${currentCard.color}`}
          onClick={() => setFlipped(!flipped)}
        >
          <div className="highlight-review__card-front">
            <blockquote className="highlight-review__quote">
              {currentCard.selectedText}
            </blockquote>
            {!flipped && (
              <p className="highlight-review__flip-hint">{t('highlights.flipCard')}</p>
            )}
          </div>

          {flipped && (
            <div className="highlight-review__card-back">
              {currentCard.bookTitle && (
                <p className="highlight-review__book">{currentCard.bookTitle}</p>
              )}
              {currentCard.chapterTitle && (
                <p className="highlight-review__chapter">{currentCard.chapterTitle}</p>
              )}
              {currentCard.noteText && (
                <p className="highlight-review__card-note">
                  {t('highlights.note')}: {currentCard.noteText}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="highlight-review__actions">
          <button
            className="highlight-review__next-btn"
            onClick={handleNext}
          >
            {t('highlights.nextCard')}
          </button>
        </div>

        <button
          className="highlight-review__back-link"
          onClick={() => navigate(getLocalizedPath('/words?tab=highlights'))}
        >
          {t('highlights.backToHighlights')}
        </button>
      </div>
      <Footer />
    </>
  )
}
