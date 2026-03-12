import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBlogPost, likeBlogPost, unlikeBlogPost, type BlogPostDetailDto } from '../api/blog'
import { getStorageUrl } from '../api/client'
import { SeoHead } from '../components/SeoHead'
import { JsonLd } from '../components/JsonLd'
import { Footer } from '../components/Footer'
import { ShareButtons } from '../components/blog/ShareButtons'
import { BlogComments } from '../components/blog/BlogComments'
import { LocalizedLink } from '../components/LocalizedLink'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()

  const [post, setPost] = useState<BlogPostDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [liking, setLiking] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setLoading(true)
    getBlogPost(slug, language)
      .then((data) => {
        if (cancelled) return
        setPost(data)
        setLiked(data.isLikedByMe)
        setLikeCount(data.likeCount)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, language])

  // Intercept internal links in post content for SPA navigation
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      e.preventDefault()
      navigate(href)
    }
    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [navigate, post])

  const handleLike = useCallback(async () => {
    if (!isAuthenticated || !post || liking) return
    setLiking(true)
    try {
      const res = liked
        ? await unlikeBlogPost(post.id)
        : await likeBlogPost(post.id)
      setLiked(res.liked)
      setLikeCount(res.likeCount)
    } catch {}
    setLiking(false)
  }, [isAuthenticated, post, liked, liking])

  if (loading) {
    return (
      <div className="blog-post">
        <div className="blog-card--skeleton">
          <div className="blog-card__cover" style={{ aspectRatio: '16/9', borderRadius: 12 }} />
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <>
        <div className="blog-post">
          <SeoHead title={t('blog.title')} noindex statusCode={404} />
          <p className="error">{error || 'Post not found'}</p>
          <LocalizedLink to="/blog" className="blog-post__back">
            {t('blog.backToBlog')}
          </LocalizedLink>
        </div>
        <Footer />
      </>
    )
  }

  const dateStr = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const tagList = post.tags ? post.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <>
      <article className="blog-post">
        <SeoHead
          title={post.seoTitle || post.title}
          description={post.seoDescription || post.excerpt || undefined}
          image={post.coverImagePath ? getStorageUrl(post.coverImagePath) : undefined}
          type="website"
        />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.title,
            description: post.seoDescription || post.excerpt || undefined,
            image: post.coverImagePath ? getStorageUrl(post.coverImagePath) : undefined,
            author: { '@type': 'Person', name: post.authorName },
            datePublished: post.publishedAt || undefined,
            inLanguage: post.language,
          }}
        />

        <LocalizedLink to="/blog" className="blog-post__back">
          <span className="material-icons-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          {t('blog.backToBlog')}
        </LocalizedLink>

        {post.coverImagePath && (
          <div className="blog-post__cover">
            <img src={getStorageUrl(post.coverImagePath)} alt={post.title} />
          </div>
        )}

        <h1 className="blog-post__title">{post.title}</h1>

        <div className="blog-post__meta">
          <span>{t('blog.writtenBy')} {post.authorName}</span>
          {dateStr && (
            <>
              <span className="blog-post__meta-sep">&middot;</span>
              <span>{dateStr}</span>
            </>
          )}
          {post.viewCount > 0 && (
            <>
              <span className="blog-post__meta-sep">&middot;</span>
              <span>{post.viewCount} views</span>
            </>
          )}
        </div>

        <div
          ref={contentRef}
          className="blog-post__content"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {tagList.length > 0 && (
          <div className="blog-post__tags">
            {tagList.map((tag) => (
              <LocalizedLink
                key={tag}
                to={`/blog?tag=${encodeURIComponent(tag)}`}
                className="blog-post__tag"
              >
                {tag}
              </LocalizedLink>
            ))}
          </div>
        )}

        <div className="blog-post__actions">
          <button
            className={`blog-post__like-btn ${liked ? 'blog-post__like-btn--active' : ''}`}
            onClick={handleLike}
            disabled={!isAuthenticated || liking}
          >
            <span className="material-icons-outlined">
              {liked ? 'favorite' : 'favorite_border'}
            </span>
            {likeCount > 0 && likeCount}
          </button>
          <ShareButtons url={pageUrl} title={post.title} />
        </div>

        <BlogComments postId={post.id} />
      </article>
      <Footer />
    </>
  )
}
