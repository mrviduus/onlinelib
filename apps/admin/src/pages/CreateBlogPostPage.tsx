import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../api/client'

export function CreateBlogPostPage() {
  const navigate = useNavigate()
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!content.trim()) {
      setError('Content is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const result = await adminApi.createBlogPost({
        title: title.trim(),
        content,
        language,
        authorName: authorName.trim(),
        excerpt: excerpt || undefined,
        tags: tags || undefined,
        seoTitle: seoTitle || undefined,
        seoDescription: seoDescription || undefined,
      })

      navigate(`/blog/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
      setSaving(false)
    }
  }

  return (
    <div className="edit-genre-page">
      <div className="edit-genre-page__header">
        <Link to="/blog" className="back-link">&larr; Back to Blog</Link>
        <h1>New Blog Post</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSave} className="edit-author-form">
        <div className="form-section">
          <h2>Basic Info</h2>

          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
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
            <label htmlFor="content">Content (HTML) *</label>
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
          <Link to="/blog" className="btn">Cancel</Link>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
