import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { getVocabStats } from '../../api/vocabulary'
import { consumeReviewPrompt } from '../../hooks/useReviewPrompt'

export function VocabReviewCard() {
  const { isAuthenticated } = useAuth()
  const { language } = useLanguage()
  const [dueCount, setDueCount] = useState(0)
  const [fromReader, setFromReader] = useState(false)

  useEffect(() => {
    // Check if we came from reader
    const prompt = consumeReviewPrompt()
    if (prompt > 0) {
      setDueCount(prompt)
      setFromReader(true)
      return
    }

    // Otherwise fetch fresh stats
    if (!isAuthenticated) return
    getVocabStats()
      .then((stats) => setDueCount(stats.dueNow))
      .catch(() => {})
  }, [isAuthenticated])

  if (!isAuthenticated || dueCount === 0) return null

  return (
    <div className="vocab-review-card">
      <div className="vocab-review-card__icon">📚</div>
      <div className="vocab-review-card__text">
        {fromReader
          ? `You have ${dueCount} word${dueCount === 1 ? '' : 's'} to review`
          : `${dueCount} word${dueCount === 1 ? '' : 's'} due for review`}
      </div>
      <Link to={`/${language}/vocabulary/review`} className="vocab-review-card__btn">
        Review now
      </Link>
    </div>
  )
}
