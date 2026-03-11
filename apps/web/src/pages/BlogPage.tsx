import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getBlogPosts, type BlogPostListItemDto } from '../api/blog'
import { BlogCard } from '../components/blog/BlogCard'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import { useLanguage } from '../context/LanguageContext'

const POSTS_PER_PAGE = 12

export function BlogPage() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const tag = searchParams.get('tag') || ''

  const [posts, setPosts] = useState<BlogPostListItemDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    getBlogPosts({ language, tag: tag || undefined, limit: POSTS_PER_PAGE, offset: 0 })
      .then((res) => {
        setPosts(res.items)
        setTotal(res.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [language, tag])

  const handleLoadMore = () => {
    setLoadingMore(true)
    getBlogPosts({ language, tag: tag || undefined, limit: POSTS_PER_PAGE, offset: posts.length })
      .then((res) => {
        setPosts((prev) => [...prev, ...res.items])
        setTotal(res.total)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  const handleTagFilter = (newTag: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (newTag) next.set('tag', newTag)
      else next.delete('tag')
      return next
    }, { replace: true })
  }

  // Collect unique tags from loaded posts
  const allTags = [...new Set(
    posts
      .filter((p) => p.tags)
      .flatMap((p) => p.tags!.split(',').map((t) => t.trim()))
      .filter(Boolean)
  )]

  const hasMore = posts.length < total

  return (
    <>
      <div className="blog-page">
        <SeoHead title={t('blog.title')} description={t('blog.title')} />
        <h1>{t('blog.title')}</h1>

        {allTags.length > 0 && (
          <div className="blog-page__tags">
            <button
              className={`blog-page__tag ${!tag ? 'blog-page__tag--active' : ''}`}
              onClick={() => handleTagFilter('')}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                className={`blog-page__tag ${tag === t ? 'blog-page__tag--active' : ''}`}
                onClick={() => handleTagFilter(tag === t ? '' : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="blog-page__grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="blog-card blog-card--skeleton">
                <div className="blog-card__cover" />
                <div className="blog-card__content">
                  <div className="blog-card__title" />
                  <div className="blog-card__excerpt" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="blog-page__empty">
            <p>{t('blog.noPostsYet')}</p>
          </div>
        ) : (
          <>
            <div className="blog-page__grid">
              {posts.map((post) => (
                <BlogCard
                  key={post.id}
                  slug={post.slug}
                  title={post.title}
                  excerpt={post.excerpt}
                  coverImagePath={post.coverImagePath}
                  authorName={post.authorName}
                  tags={post.tags}
                  likeCount={post.likeCount}
                  commentCount={post.commentCount}
                  publishedAt={post.publishedAt}
                />
              ))}
            </div>

            {hasMore && (
              <div className="blog-pagination">
                <button
                  className="blog-pagination__btn"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? '...' : t('blog.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  )
}
