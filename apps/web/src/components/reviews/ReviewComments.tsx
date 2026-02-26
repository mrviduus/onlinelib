import { useState, useEffect } from 'react'
import { getReviewComments, addReviewComment, deleteReviewComment, type ReviewCommentDto } from '../../api/reviews'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  reviewId: string
  editionId: string
}

export function ReviewComments({ reviewId, editionId }: Props) {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuth()
  const [comments, setComments] = useState<ReviewCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    getReviewComments(editionId, reviewId, { limit: 50 })
      .then((res) => { setComments(res.items) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [reviewId, editionId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      const comment = await addReviewComment(reviewId, text.trim())
      setComments((prev) => [...prev, comment])
      setText('')
    } catch {}
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteReviewComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch {}
  }

  if (loading) return <div className="review-comments__loading">...</div>

  return (
    <div className="review-comments">
      {comments.map((c) => (
        <div key={c.id} className="review-comments__item">
          <div className="review-comments__avatar">
            {c.userPicture ? (
              <img src={c.userPicture} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{c.userName?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
          <div className="review-comments__content">
            <div className="review-comments__head">
              <span className="review-comments__name">{c.userName || 'User'}</span>
              <span className="review-comments__date">
                {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {user?.id === c.userId && (
                <button className="review-comments__delete" onClick={() => handleDelete(c.id)}>
                  <span className="material-icons-outlined">delete_outline</span>
                </button>
              )}
            </div>
            <p className="review-comments__text">{c.text}</p>
          </div>
        </div>
      ))}

      {isAuthenticated && (
        <form className="review-comments__form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('reviews.addComment')}
            maxLength={2000}
            className="review-comments__input"
          />
          <button type="submit" disabled={submitting || !text.trim()} className="review-comments__send">
            <span className="material-icons-outlined">send</span>
          </button>
        </form>
      )}
    </div>
  )
}
