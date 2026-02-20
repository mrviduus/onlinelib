import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getRating, upsertRating, deleteRating } from '../api/userRatings'

interface StarRatingProps {
  editionId: string
}

export function StarRating({ editionId }: StarRatingProps) {
  const { isAuthenticated } = useAuth()
  const [rating, setRating] = useState<number>(0)
  const [hover, setHover] = useState<number>(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !editionId) return
    getRating(editionId).then((r) => {
      if (r) setRating(r.rating)
    }).catch(() => {})
  }, [isAuthenticated, editionId])

  if (!isAuthenticated) return null

  const handleClick = async (star: number) => {
    if (saving) return
    setSaving(true)
    try {
      if (star === rating) {
        await deleteRating(editionId)
        setRating(0)
      } else {
        await upsertRating(editionId, { rating: star })
        setRating(star)
      }
    } catch {}
    setSaving(false)
  }

  return (
    <div className="star-rating" role="group" aria-label="Rate this book">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-rating__star ${star <= (hover || rating) ? 'star-rating__star--active' : ''}`}
          onClick={() => handleClick(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          disabled={saving}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={star <= (hover || rating) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  )
}
