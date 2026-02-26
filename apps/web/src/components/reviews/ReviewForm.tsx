import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { upsertRating, type UserRatingDto } from '../../api/userRatings'

interface Props {
  editionId: string
  existingRating?: UserRatingDto | null
  onSubmit: (rating: UserRatingDto) => void
  onCancel: () => void
}

export function ReviewForm({ editionId, existingRating, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const [rating, setRating] = useState(existingRating?.rating ?? 0)
  const [hoverRating, setHoverRating] = useState(0)
  const [title, setTitle] = useState(existingRating?.title ?? '')
  const [reviewText, setReviewText] = useState(existingRating?.reviewText ?? '')
  const [isSpoiler, setIsSpoiler] = useState(existingRating?.isSpoiler ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating < 0.5) {
      setError(t('reviews.ratingRequired'))
      return
    }
    if (!reviewText.trim()) {
      setError(t('reviews.textRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await upsertRating(editionId, {
        rating,
        reviewText: reviewText.trim(),
        title: title.trim() || null,
        isSpoiler,
      })
      onSubmit(result)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const displayRating = hoverRating || rating

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <div className="review-form__stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="review-form__star-btn"
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(star)}
          >
            <span className={`material-icons-outlined ${star <= displayRating ? 'review-form__star--filled' : ''}`}>
              {star <= displayRating ? 'star' : 'star_outline'}
            </span>
          </button>
        ))}
        {displayRating > 0 && <span className="review-form__rating-text">{displayRating}/5</span>}
      </div>

      <input
        type="text"
        className="review-form__title"
        placeholder={t('reviews.reviewTitle')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />

      <textarea
        className="review-form__text"
        placeholder={t('reviews.reviewText')}
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        rows={5}
        maxLength={10000}
      />

      <label className="review-form__spoiler-label">
        <input
          type="checkbox"
          checked={isSpoiler}
          onChange={(e) => setIsSpoiler(e.target.checked)}
        />
        {t('reviews.markSpoiler')}
      </label>

      {error && <p className="review-form__error">{error}</p>}

      <div className="review-form__actions">
        <button type="button" className="review-form__cancel" onClick={onCancel}>
          {t('reviews.cancel')}
        </button>
        <button type="submit" className="review-form__submit" disabled={saving}>
          {saving ? '...' : existingRating?.reviewText ? t('reviews.editReview') : t('reviews.submit')}
        </button>
      </div>
    </form>
  )
}
