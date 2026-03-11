import { useState, useEffect } from 'react'
import { getBlogPostComments, addBlogComment, deleteBlogComment, type BlogCommentDto } from '../../api/blog'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  postId: string
}

export function BlogComments({ postId }: Props) {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuth()
  const [comments, setComments] = useState<BlogCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  useEffect(() => {
    setLoading(true)
    getBlogPostComments(postId, { limit: 100 })
      .then((res) => setComments(res.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      const comment = await addBlogComment(postId, text.trim())
      setComments((prev) => [...prev, comment])
      setText('')
    } catch {}
    setSubmitting(false)
  }

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || submitting) return
    setSubmitting(true)
    try {
      const reply = await addBlogComment(postId, replyText.trim(), parentId)
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? { ...c, replies: [...(c.replies || []), reply] }
            : c
        )
      )
      setReplyText('')
      setReplyTo(null)
    } catch {}
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string, parentId?: string) => {
    try {
      await deleteBlogComment(commentId)
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
              : c
          )
        )
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      }
    } catch {}
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const renderAvatar = (picture: string | null, name: string | null) => (
    <div className="blog-comments__avatar">
      {picture ? (
        <img src={picture} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span>{name?.[0]?.toUpperCase() || '?'}</span>
      )}
    </div>
  )

  if (loading) return <div className="blog-comments__loading">...</div>

  return (
    <div className="blog-comments">
      <h3 className="blog-comments__title">
        {t('blog.comments')} {comments.length > 0 && `(${comments.length})`}
      </h3>

      {comments.length === 0 && !isAuthenticated && (
        <p className="blog-comments__empty">{t('blog.noPostsYet')}</p>
      )}

      {comments.map((c) => (
        <div key={c.id}>
          <div className="blog-comments__item">
            {renderAvatar(c.userPicture, c.userName)}
            <div className="blog-comments__content">
              <div className="blog-comments__head">
                <span className="blog-comments__name">{c.userName || 'User'}</span>
                <span className="blog-comments__date">{formatDate(c.createdAt)}</span>
                {user?.id === c.userId && (
                  <button className="blog-comments__delete" onClick={() => handleDelete(c.id)}>
                    <span className="material-icons-outlined">delete_outline</span>
                  </button>
                )}
              </div>
              <p className="blog-comments__text">{c.text}</p>
              {isAuthenticated && (
                <button
                  className="blog-comments__reply-btn"
                  onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                >
                  {t('blog.reply')}
                </button>
              )}
            </div>
          </div>

          {/* Replies */}
          {c.replies && c.replies.length > 0 && (
            <div className="blog-comments__replies">
              {c.replies.map((r) => (
                <div key={r.id} className="blog-comments__reply">
                  {renderAvatar(r.userPicture, r.userName)}
                  <div className="blog-comments__content">
                    <div className="blog-comments__head">
                      <span className="blog-comments__name">{r.userName || 'User'}</span>
                      <span className="blog-comments__date">{formatDate(r.createdAt)}</span>
                      {user?.id === r.userId && (
                        <button className="blog-comments__delete" onClick={() => handleDelete(r.id, c.id)}>
                          <span className="material-icons-outlined">delete_outline</span>
                        </button>
                      )}
                    </div>
                    <p className="blog-comments__text">{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply form */}
          {replyTo === c.id && (
            <div className="blog-comments__reply-form">
              <textarea
                className="blog-comments__input"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('blog.replyPlaceholder')}
                maxLength={2000}
                rows={1}
              />
              <button
                className="blog-comments__send"
                disabled={submitting || !replyText.trim()}
                onClick={() => handleReply(c.id)}
              >
                <span className="material-icons-outlined">send</span>
              </button>
            </div>
          )}
        </div>
      ))}

      {isAuthenticated && (
        <form className="blog-comments__form" onSubmit={handleSubmit}>
          <textarea
            className="blog-comments__input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('blog.commentPlaceholder')}
            maxLength={2000}
            rows={2}
          />
          <button type="submit" disabled={submitting || !text.trim()} className="blog-comments__send">
            <span className="material-icons-outlined">send</span>
          </button>
        </form>
      )}
    </div>
  )
}
