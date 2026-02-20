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

  const handleClick = async (value: number) => {
    if (saving) return
    setSaving(true)
    try {
      if (value === rating) {
        await deleteRating(editionId)
        setRating(0)
      } else {
        await upsertRating(editionId, { rating: value })
        setRating(value)
      }
    } catch {}
    setSaving(false)
  }

  const active = hover || rating

  return (
    <div className="star-rating" role="group" aria-label="Rate this book">
      {[1, 2, 3, 4, 5].map((star) => {
        const halfValue = star - 0.5
        const fullValue = star
        const isFull = fullValue <= active
        const isHalf = !isFull && halfValue <= active

        return (
          <span key={star} className="star-rating__star-wrapper">
            {/* Left half */}
            <button
              type="button"
              className="star-rating__star-half star-rating__star-half--left"
              onClick={() => handleClick(halfValue)}
              onMouseEnter={() => setHover(halfValue)}
              onMouseLeave={() => setHover(0)}
              disabled={saving}
              aria-label={`${halfValue} stars`}
            />
            {/* Right half */}
            <button
              type="button"
              className="star-rating__star-half star-rating__star-half--right"
              onClick={() => handleClick(fullValue)}
              onMouseEnter={() => setHover(fullValue)}
              onMouseLeave={() => setHover(0)}
              disabled={saving}
              aria-label={`${fullValue} star${fullValue > 1 ? 's' : ''}`}
            />
            {/* Star SVG visual */}
            <svg
              className={`star-rating__star-svg ${isFull ? 'star-rating__star-svg--full' : ''} ${isHalf ? 'star-rating__star-svg--half' : ''}`}
              width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"
              style={{ pointerEvents: 'none' }}
            >
              <defs>
                <clipPath id={`half-clip-${editionId}-${star}`}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
              </defs>
              {/* Empty star outline */}
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" />
              {/* Full fill */}
              {isFull && (
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none" />
              )}
              {/* Half fill */}
              {isHalf && (
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none" clipPath={`url(#half-clip-${editionId}-${star})`} />
              )}
            </svg>
          </span>
        )
      })}
    </div>
  )
}
