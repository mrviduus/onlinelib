import { LocalizedLink } from '../LocalizedLink'
import { getStorageUrl } from '../../api/client'
import { useTranslation } from '../../hooks/useTranslation'

interface Props {
  slug: string
  title: string
  excerpt: string | null
  coverImagePath: string | null
  authorName: string
  tags: string | null
  likeCount: number
  commentCount: number
  publishedAt: string | null
}

export function BlogCard({
  slug,
  title,
  excerpt,
  coverImagePath,
  authorName,
  tags,
  likeCount,
  commentCount,
  publishedAt,
}: Props) {
  const { t } = useTranslation()

  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const tagList = tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []

  return (
    <LocalizedLink to={`/blog/${slug}`} className="blog-card" style={{ textDecoration: 'none' }}>
      <div className="blog-card__cover">
        {coverImagePath ? (
          <img src={getStorageUrl(coverImagePath)} alt={title} loading="lazy" />
        ) : (
          <div className="blog-card__cover-placeholder">
            <span className="material-icons-outlined">article</span>
          </div>
        )}
      </div>
      <div className="blog-card__content">
        <h3 className="blog-card__title">{title}</h3>
        {excerpt && <p className="blog-card__excerpt">{excerpt}</p>}
        <div className="blog-card__meta">
          <span className="blog-card__meta-item">
            {t('blog.writtenBy')} {authorName}
          </span>
          {dateStr && (
            <span className="blog-card__meta-item">{dateStr}</span>
          )}
          {likeCount > 0 && (
            <span className="blog-card__meta-item">
              <span className="material-icons-outlined">favorite</span>
              {likeCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="blog-card__meta-item">
              <span className="material-icons-outlined">chat_bubble_outline</span>
              {commentCount}
            </span>
          )}
        </div>
        {tagList.length > 0 && (
          <div className="blog-card__tags">
            {tagList.map((tag) => (
              <span key={tag} className="blog-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </LocalizedLink>
  )
}
