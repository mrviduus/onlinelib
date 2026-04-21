import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, BlogPostListItem, BlogStats } from '../api/client'

type StatusFilter = 'all' | 'published' | 'draft'
type LanguageFilter = 'all' | 'en'

export function BlogPostsPage() {
  const [posts, setPosts] = useState<BlogPostListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all')
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stats, setStats] = useState<BlogStats | null>(null)
  const limit = 20

  useEffect(() => {
    adminApi.getBlogStats()
      .then(setStats)
      .catch(console.error)
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    adminApi.getBlogPosts({
      search: searchQuery || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      language: languageFilter === 'all' ? undefined : languageFilter,
      offset,
      limit,
    })
      .then((data) => {
        if (cancelled) return
        setPosts(data.items)
        setTotal(data.total)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load blog posts')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [offset, searchQuery, statusFilter, languageFilter, refreshKey])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
    setSearchQuery(search)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return
    try {
      await adminApi.deleteBlogPost(id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString() : '-'

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="genres-page">
      <div className="genres-page__header">
        <h1>Blog Posts</h1>
        <span className="genres-page__count">{total} total</span>
        <Link to="/blog/new" className="btn btn--primary">
          New Post
        </Link>
      </div>

      {stats && (
        <div className="stats-cards">
          <div className="stats-card">
            <div className="stats-card__value">{stats.total}</div>
            <div className="stats-card__label">Total Posts</div>
          </div>
          <div className="stats-card stats-card--success">
            <div className="stats-card__value">{stats.published}</div>
            <div className="stats-card__label">Published</div>
          </div>
          <div className="stats-card stats-card--draft">
            <div className="stats-card__value">{stats.draft}</div>
            <div className="stats-card__label">Draft</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{stats.totalComments}</div>
            <div className="stats-card__label">Comments</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{stats.totalLikes}</div>
            <div className="stats-card__label">Likes</div>
          </div>
        </div>
      )}

      <div className="genres-page__filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter)
            setOffset(0)
          }}
          className="status-filter"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select
          value={languageFilter}
          onChange={(e) => {
            setLanguageFilter(e.target.value as LanguageFilter)
            setOffset(0)
          }}
          className="status-filter"
        >
          <option value="all">All languages</option>
          <option value="en">English</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : posts.length === 0 ? (
        <p>No blog posts found.</p>
      ) : (
        <>
          <table className="genres-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Language</th>
                <th>Status</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Comments</th>
                <th>Published</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <Link to={`/blog/${post.id}`}>{post.title}</Link>
                  </td>
                  <td>{post.authorName}</td>
                  <td>{post.language.toUpperCase()}</td>
                  <td>
                    <span className={post.status === 'Published' ? 'badge badge--success' : 'badge badge--draft'}>
                      {post.status}
                    </span>
                  </td>
                  <td>{post.viewCount}</td>
                  <td>{post.likeCount}</td>
                  <td>{post.commentCount}</td>
                  <td>{formatDate(post.publishedAt)}</td>
                  <td>{formatDate(post.createdAt)}</td>
                  <td className="actions-cell">
                    <Link to={`/blog/${post.id}`} className="btn btn--small">
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(post.id, post.title)}
                      className="btn btn--small btn--danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="btn btn--small"
              >
                &larr; Prev
              </button>
              <span className="pagination__info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="btn btn--small"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
