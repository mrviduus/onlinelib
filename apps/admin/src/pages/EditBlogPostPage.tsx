import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { adminApi, BlogPostDetail } from '../api/client'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export function EditBlogPostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [post, setPost] = useState<BlogPostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('en')
  const [authorName, setAuthorName] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')

  useEffect(() => {
    if (!id) return
    const fetchPost = async () => {
      try {
        const data = await adminApi.getBlogPost(id)
        setPost(data)
        setTitle(data.title)
        setLanguage(data.language)
        setAuthorName(data.authorName || '')
        setExcerpt(data.excerpt || '')
        setTags(data.tags || '')
        setContent(data.content)
        setSeoTitle(data.seoTitle || '')
        setSeoDescription(data.seoDescription || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post')
      } finally {
        setLoading(false)
      }
    }
    fetchPost()
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    try {
      const updated = await adminApi.updateBlogPost(id, {
        title,
        content,
        language,
        authorName,
        excerpt: excerpt || undefined,
        tags: tags || undefined,
        seoTitle: seoTitle || undefined,
        seoDescription: seoDescription || undefined,
      })
      setPost(updated)
      alert('Post saved!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!id || !post) return
    try {
      await adminApi.publishBlogPost(id)
      const updated = await adminApi.getBlogPost(id)
      setPost(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const handleUnpublish = async () => {
    if (!id || !post) return
    try {
      await adminApi.unpublishBlogPost(id)
      const updated = await adminApi.getBlogPost(id)
      setPost(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish')
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files?.[0]) return
    try {
      const result = await adminApi.uploadBlogCover(id, e.target.files[0])
      setPost((prev) => prev ? { ...prev, coverImagePath: result.coverImagePath } : prev)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload cover')
    }
  }

  const handleCoverDelete = async () => {
    if (!id) return
    try {
      await adminApi.deleteBlogCover(id)
      setPost((prev) => prev ? { ...prev, coverImagePath: null } : prev)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete cover')
    }
  }

  const handleDelete = async () => {
    if (!id || !post) return
    if (!confirm(`Are you sure you want to delete "${post.title}"?`)) return
    try {
      await adminApi.deleteBlogPost(id)
      navigate('/blog')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) return <p>Loading...</p>
  if (error) return <div className="error-banner">{error}</div>
  if (!post) return <p>Post not found</p>

  return (
    <div className="edit-genre-page">
      <div className="edit-genre-page__header">
        <Link to="/blog" className="back-link">&larr; Back to Blog</Link>
        <h1>{post.title}</h1>
        <span className="slug-badge">/{post.slug}</span>
        <span className={post.status === 'Published' ? 'badge badge--success' : 'badge badge--draft'}>
          {post.status}
        </span>
      </div>

      <div className="form-actions" style={{ marginBottom: '1rem' }}>
        {post.status === 'Published' ? (
          <button type="button" onClick={handleUnpublish} className="btn">
            Unpublish
          </button>
        ) : (
          <button type="button" onClick={handlePublish} className="btn btn--primary">
            Publish
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="edit-genre-form">
        <div className="form-section">
          <h2>Basic Info</h2>

          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="language">Language</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="uk">Ukrainian</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="authorName">Author Name</label>
            <input
              id="authorName"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Author name..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="excerpt">Excerpt</label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              placeholder="Short excerpt..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags</label>
            <input
              id="tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated tags..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="content">Content (HTML)</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              placeholder="HTML content..."
              required
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Cover Image</h2>
          {post.coverImagePath ? (
            <div>
              <img
                src={`${API_BASE}/storage/${post.coverImagePath}`}
                alt="Cover"
                style={{ maxWidth: '300px', display: 'block', marginBottom: '1rem' }}
              />
              <button type="button" onClick={handleCoverDelete} className="btn btn--danger btn--small">
                Delete Cover
              </button>
            </div>
          ) : (
            <p>No cover image</p>
          )}
          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label htmlFor="cover">Upload Cover</label>
            <input id="cover" type="file" accept="image/*" onChange={handleCoverUpload} />
          </div>
        </div>

        <div className="form-section">
          <h2>SEO</h2>

          <div className="form-group">
            <label htmlFor="seoTitle">SEO Title</label>
            <input
              id="seoTitle"
              type="text"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Custom page title for search engines"
            />
          </div>

          <div className="form-group">
            <label htmlFor="seoDescription">SEO Description</label>
            <textarea
              id="seoDescription"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              placeholder="Meta description for search engines"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <div className="form-section form-section--danger">
        <h2>Danger Zone</h2>
        <p>Deleting a blog post is permanent and cannot be undone.</p>
        <button
          type="button"
          onClick={handleDelete}
          className="btn btn--danger"
        >
          Delete Post
        </button>
      </div>
    </div>
  )
}
