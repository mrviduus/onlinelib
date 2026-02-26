import { useState } from 'react'
import type { PublicReviewDto } from '../../api/reviews'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  review: PublicReviewDto
  onLike: (reviewId: string) => void
  onUnlike: (reviewId: string) => void
  onToggleComments?: (reviewId: string) => void
  isAuthenticated: boolean
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.25
  return (
    <span className="review-card__stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`material-icons-outlined review-card__star ${
            i < full ? 'review-card__star--filled' : i === full && half ? 'review-card__star--half' : ''
          }`}
        >
          {i < full ? 'star' : i === full && half ? 'star_half' : 'star_outline'}
        </span>
      ))}
    </span>
  )
}

export function ReviewCard({ review, onLike, onUnlike, onToggleComments, isAuthenticated }: Props) {
  const { t } = useTranslation()
  const [showSpoiler, setShowSpoiler] = useState(false)
  const [liked, setLiked] = useState(review.isLikedByMe)
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount)

  const handleLike = () => {
    if (!isAuthenticated) return
    if (liked) {
      onUnlike(review.id)
      setLiked(false)
      setHelpfulCount((c) => Math.max(0, c - 1))
    } else {
      onLike(review.id)
      setLiked(true)
      setHelpfulCount((c) => c + 1)
    }
  }

  const initial = review.userName?.[0]?.toUpperCase() || '?'

  return (
    <article className="review-card">
      <div className="review-card__header">
        <div className="review-card__avatar">
          {review.userPicture ? (
            <img src={review.userPicture} alt="" className="review-card__avatar-img" referrerPolicy="no-referrer" />
          ) : (
            <span className="review-card__avatar-initial">{initial}</span>
          )}
        </div>
        <div className="review-card__meta">
          <span className="review-card__name">{review.userName || t('reviews.anonymous')}</span>
          <span className="review-card__date">
            {new Date(review.createdAt).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric'
            })}
          </span>
        </div>
        <Stars rating={review.rating} />
      </div>

      {review.title && <h4 className="review-card__title">{review.title}</h4>}

      <div className={`review-card__body ${review.isSpoiler && !showSpoiler ? 'review-card__body--spoiler' : ''}`}>
        <p>{review.reviewText}</p>
        {review.isSpoiler && !showSpoiler && (
          <button className="review-card__spoiler-btn" onClick={() => setShowSpoiler(true)}>
            <span className="material-icons-outlined">visibility</span>
            {t('reviews.showSpoiler')}
          </button>
        )}
      </div>

      <div className="review-card__actions">
        <button
          className={`review-card__helpful ${liked ? 'review-card__helpful--active' : ''}`}
          onClick={handleLike}
          disabled={!isAuthenticated}
        >
          <span className="material-icons-outlined">thumb_up</span>
          {t('reviews.helpful')} ({helpfulCount})
        </button>
        {onToggleComments && (
          <button className="review-card__comment-btn" onClick={() => onToggleComments(review.id)}>
            <span className="material-icons-outlined">chat_bubble_outline</span>
            {review.commentCount > 0 && <span>{review.commentCount}</span>}
          </button>
        )}
      </div>
    </article>
  )
}
