import { useState, useEffect, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { consumeReviewPrompt } from '../hooks/useReviewPrompt'
import './ReviewPromptBanner.css'

export function ReviewPromptBanner() {
  const location = useLocation()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const [count, setCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const due = consumeReviewPrompt()
    if (due > 0) {
      setCount(due)
      timerRef.current = setTimeout(() => setCount(0), 10000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [location.pathname])

  if (count === 0) return null

  const message = t('reviewPrompt.message').replace('{count}', String(count))

  return (
    <div className="review-prompt">
      <span className="review-prompt__text">{message}</span>
      <div className="review-prompt__actions">
        <Link
          to={getLocalizedPath('/words/review')}
          className="review-prompt__btn review-prompt__btn--primary"
          onClick={() => setCount(0)}
        >
          {t('reviewPrompt.reviewNow')}
        </Link>
        <button
          className="review-prompt__btn review-prompt__btn--dismiss"
          onClick={() => setCount(0)}
        >
          {t('reviewPrompt.later')}
        </button>
      </div>
    </div>
  )
}
