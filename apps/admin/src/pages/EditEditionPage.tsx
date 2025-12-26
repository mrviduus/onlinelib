import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi, EditionDetail } from '../api/client'

export function EditEditionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [edition, setEdition] = useState<EditionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [authorsJson, setAuthorsJson] = useState('')
  const [description, setDescription] = useState('')
  // SEO fields
  const [indexable, setIndexable] = useState(true)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [canonicalOverride, setCanonicalOverride] = useState('')

  useEffect(() => {
    if (!id) return
    adminApi.getEdition(id)
      .then((data) => {
        setEdition(data)
        setTitle(data.title)
        setAuthorsJson(data.authorsJson || '')
        setDescription(data.description || '')
        setIndexable(data.indexable ?? true)
        setSeoTitle(data.seoTitle || '')
        setSeoDescription(data.seoDescription || '')
        setCanonicalOverride(data.canonicalOverride || '')
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
      await adminApi.updateEdition(id, {
        title,
        authorsJson: authorsJson || null,
        description: description || null,
        indexable,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        canonicalOverride: canonicalOverride || null,
      })
      navigate('/editions')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!id) return
    try {
      await adminApi.publishEdition(id)
      const updated = await adminApi.getEdition(id)
      setEdition(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const handleUnpublish = async () => {
    if (!id) return
    try {
      await adminApi.unpublishEdition(id)
      const updated = await adminApi.getEdition(id)
      setEdition(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Are you sure you want to delete this edition?')) return
    try {
      await adminApi.deleteEdition(id)
      navigate('/editions')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="edit-edition-page">
        <p>Loading...</p>
      </div>
    )
  }

  if (!edition) {
    return (
      <div className="edit-edition-page">
        <p className="error">Edition not found</p>
      </div>
    )
  }

  return (
    <div className="edit-edition-page">
      <div className="edit-edition-page__header">
        <h1>Edit Edition</h1>
        <span className={`badge badge--${edition.status.toLowerCase()}`}>{edition.status}</span>
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
          <label htmlFor="authors">Authors (JSON)</label>
          <input
            type="text"
            id="authors"
            value={authorsJson}
            onChange={(e) => setAuthorsJson(e.target.value)}
            placeholder='["Author Name"]'
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={5000}
          />
        </div>

        <fieldset className="form-fieldset">
          <legend>SEO Settings</legend>

          <div className="form-group form-group--checkbox">
            <label>
              <input
                type="checkbox"
                checked={indexable}
                onChange={(e) => setIndexable(e.target.checked)}
              />
              Indexable by search engines
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="seoTitle">SEO Title (overrides default)</label>
            <input
              type="text"
              id="seoTitle"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder={title ? `${title} — read online | TextStack` : 'Auto-generated from title'}
              maxLength={160}
            />
            <small>{seoTitle.length}/160</small>
          </div>

          <div className="form-group">
            <label htmlFor="seoDescription">SEO Description</label>
            <textarea
              id="seoDescription"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              placeholder="Auto-generated from book description"
              maxLength={320}
            />
            <small>{seoDescription.length}/320</small>
          </div>

          <div className="form-group">
            <label htmlFor="canonicalOverride">Canonical URL Override</label>
            <input
              type="url"
              id="canonicalOverride"
              value={canonicalOverride}
              onChange={(e) => setCanonicalOverride(e.target.value)}
              placeholder="Leave empty for default"
            />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn btn--primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate('/editions')} className="btn">
            Cancel
          </button>
        </div>
      </form>

      <div className="edition-info">
        <h2>Details</h2>
        <dl>
          <dt>Slug</dt>
          <dd>{edition.slug}</dd>
          <dt>Language</dt>
          <dd>{edition.language}</dd>
          <dt>Created</dt>
          <dd>{new Date(edition.createdAt).toLocaleString()}</dd>
          {edition.publishedAt && (
            <>
              <dt>Published</dt>
              <dd>{new Date(edition.publishedAt).toLocaleString()}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="edition-chapters">
        <h2>Chapters ({edition.chapters.length})</h2>
        {edition.chapters.length === 0 ? (
          <p>No chapters yet.</p>
        ) : (
          <table className="chapters-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Words</th>
              </tr>
            </thead>
            <tbody>
              {edition.chapters.map((ch) => (
                <tr key={ch.id}>
                  <td>{ch.chapterNumber}</td>
                  <td>{ch.title}</td>
                  <td>{ch.wordCount ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="edition-actions">
        <h2>Actions</h2>
        <div className="action-buttons">
          {edition.status === 'Draft' && (
            <button onClick={handlePublish} className="btn btn--success">
              Publish Edition
            </button>
          )}
          {edition.status === 'Published' && (
            <button onClick={handleUnpublish} className="btn btn--warning">
              Unpublish Edition
            </button>
          )}
          {edition.status !== 'Published' && (
            <button onClick={handleDelete} className="btn btn--danger">
              Delete Edition
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
