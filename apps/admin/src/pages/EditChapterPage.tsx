import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi, ChapterDetail } from '../api/client'

export function EditChapterPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [chapter, setChapter] = useState<ChapterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!id) return
    adminApi.getChapter(id)
      .then((data) => {
        setChapter(data)
        setTitle(data.title)
        setHtml(data.html)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!id) return

    setSaving(true)
    setError(null)
    try {
      await adminApi.updateChapter(id, { title, html })
      navigate(`/editions/${chapter?.editionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !chapter) return
    if (!confirm(`Delete chapter "${chapter.title}"? Remaining chapters will be renumbered.`)) return

    try {
      await adminApi.deleteChapter(id)
      navigate(`/editions/${chapter.editionId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return <div className="edit-chapter-page"><p>Loading...</p></div>
  }

  if (!chapter) {
    return <div className="edit-chapter-page"><p className="error">Chapter not found</p></div>
  }

  return (
    <div className="edit-chapter-page">
      <div className="edit-chapter-page__header">
        <h1>Edit Chapter {chapter.chapterNumber}</h1>
        <button onClick={() => navigate(`/editions/${chapter.editionId}`)} className="btn">
          ← Back to Edition
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="edit-form">
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
          />
        </div>

        <div className="form-group">
          <label htmlFor="html">Content (HTML)</label>
          <textarea
            id="html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={25}
            className="code-textarea"
          />
          <small>Word count: ~{html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length}</small>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn btn--primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(`/editions/${chapter.editionId}`)} className="btn">
            Cancel
          </button>
        </div>
      </form>

      <div className="chapter-info">
        <h2>Details</h2>
        <dl>
          <dt>Slug</dt>
          <dd>{chapter.slug || '—'}</dd>
          <dt>Word Count</dt>
          <dd>{chapter.wordCount ?? '—'}</dd>
          <dt>Updated</dt>
          <dd>{new Date(chapter.updatedAt).toLocaleString()}</dd>
        </dl>
      </div>

      <div className="chapter-actions">
        <h2>Danger Zone</h2>
        <button onClick={handleDelete} className="btn btn--danger">
          Delete Chapter
        </button>
        <p className="hint">Deleting will renumber remaining chapters automatically.</p>
      </div>
    </div>
  )
}
