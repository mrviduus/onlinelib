import { useState, useEffect, useCallback } from 'react'
import { getBookReviews, getBookReviewStats, likeReview, unlikeReview } from '../../api/reviews'
import { getRating, type UserRatingDto } from '../../api/userRatings'
import type { PublicReviewDto, ReviewStatsDto } from '../../api/reviews'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { RatingDistribution } from './RatingDistribution'
import { ReviewCard } from './ReviewCard'
import { ReviewForm } from './ReviewForm'
import { ReviewComments } from './ReviewComments'

interface Props {
  editionId: string
}

type SortOption = 'popular' | 'newest' | 'oldest'

export function ReviewsList({ editionId }: Props) {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()

  const [reviews, setReviews] = useState<PublicReviewDto[]>([])
  const [stats, setStats] = useState<ReviewStatsDto | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortOption>('popular')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [myRating, setMyRating] = useState<UserRatingDto | null>(null)
  const [expandedComments, setExpandedComments] = useState<string | null>(null)

  const LIMIT = 10

  const fetchReviews = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offset
    setLoading(true)
    try {
      const res = await getBookReviews(editionId, {
        sort,
        rating: ratingFilter ?? undefined,
        limit: LIMIT,
        offset: newOffset,
      })
      if (reset) {
        setReviews(res.items)
        setOffset(res.items.length)
      } else {
        setReviews((prev) => [...prev, ...res.items])
        setOffset(newOffset + res.items.length)
      }
      setTotal(res.total)
    } catch {}
    setLoading(false)
  }, [editionId, sort, ratingFilter, offset])

  // Load stats + initial reviews
  useEffect(() => {
    setOffset(0)
    setReviews([])
    getBookReviewStats(editionId).then(setStats).catch(() => {})
    fetchReviews(true)
    if (isAuthenticated) {
      getRating(editionId).then(setMyRating).catch(() => {})
    }
  }, [editionId, sort, ratingFilter])

  const handleLike = async (reviewId: string) => {
    try {
      const res = await likeReview(reviewId)
      setReviews((prev) =>
        prev.map((r) => r.id === reviewId ? { ...r, isLikedByMe: res.liked, helpfulCount: res.helpfulCount } : r)
      )
    } catch {}
  }

  const handleUnlike = async (reviewId: string) => {
    try {
      const res = await unlikeReview(reviewId)
      setReviews((prev) =>
        prev.map((r) => r.id === reviewId ? { ...r, isLikedByMe: res.liked, helpfulCount: res.helpfulCount } : r)
      )
    } catch {}
  }

  const handleReviewSubmitted = (rating: UserRatingDto) => {
    setMyRating(rating)
    setShowForm(false)
    // Refresh
    setOffset(0)
    setReviews([])
    fetchReviews(true)
    getBookReviewStats(editionId).then(setStats).catch(() => {})
  }

  const sortLabels: Record<SortOption, string> = {
    popular: t('reviews.mostPopular'),
    newest: t('reviews.newest'),
    oldest: t('reviews.oldest'),
  }

  return (
    <section className="reviews-section">
      <div className="reviews-section__header">
        <h2 className="reviews-section__title">{t('reviews.title')}</h2>
        {isAuthenticated && (
          <button className="reviews-section__write-btn" onClick={() => setShowForm(!showForm)}>
            <span className="material-icons-outlined">edit</span>
            {myRating?.reviewText ? t('reviews.editReview') : t('reviews.writeReview')}
          </button>
        )}
      </div>

      {showForm && (
        <ReviewForm
          editionId={editionId}
          existingRating={myRating}
          onSubmit={handleReviewSubmitted}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="reviews-section__grid">
        {/* Sidebar */}
        <aside className="reviews-section__sidebar">
          {stats && (
            <>
              <div className="reviews-section__stat-card">
                <h3>{t('reviews.ratingDistribution')}</h3>
                <RatingDistribution distribution={stats.distribution} totalRatings={stats.totalRatings} />
              </div>
              <div className="reviews-section__stat-card">
                <h3>{t('reviews.filterByRating')}</h3>
                <div className="reviews-section__filters">
                  <button
                    className={`reviews-section__filter ${ratingFilter === null ? 'reviews-section__filter--active' : ''}`}
                    onClick={() => setRatingFilter(null)}
                  >
                    {t('reviews.all')}
                  </button>
                  {[5, 4, 3, 2, 1].map((star) => (
                    <button
                      key={star}
                      className={`reviews-section__filter ${ratingFilter === star ? 'reviews-section__filter--active' : ''}`}
                      onClick={() => setRatingFilter(star)}
                    >
                      {star} ★
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Reviews list */}
        <div className="reviews-section__list">
          <div className="reviews-section__toolbar">
            <span className="reviews-section__count">
              {total > 0
                ? t('reviews.showing')
                    .replace('{from}', '1')
                    .replace('{to}', String(Math.min(reviews.length, total)))
                    .replace('{total}', String(total))
                : ''}
            </span>
            <div className="reviews-section__sort">
              <span>{t('reviews.sortBy')}:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
              >
                {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                  <option key={key} value={key}>{sortLabels[key]}</option>
                ))}
              </select>
            </div>
          </div>

          {reviews.length === 0 && !loading && (
            <div className="reviews-section__empty">{t('reviews.noReviews')}</div>
          )}

          {reviews.map((review) => (
            <div key={review.id}>
              <ReviewCard
                review={review}
                onLike={handleLike}
                onUnlike={handleUnlike}
                onToggleComments={(id) => setExpandedComments(expandedComments === id ? null : id)}
                isAuthenticated={isAuthenticated}
              />
              {expandedComments === review.id && (
                <ReviewComments reviewId={review.id} editionId={editionId} />
              )}
            </div>
          ))}

          {reviews.length < total && (
            <div className="reviews-section__load-more">
              <button onClick={() => fetchReviews(false)} disabled={loading}>
                {loading ? '...' : t('reviews.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
