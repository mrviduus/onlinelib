import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { adminApi, GenreDetail } from '../api/client'

export function EditGenrePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [genre, setGenre] = useState<GenreDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [indexable, setIndexable] = useState(true)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')

  useEffect(() => {
    if (!id) return
    const fetchGenre = async () => {
      try {
        const data = await adminApi.getGenre(id)
        setGenre(data)
        setName(data.name)
        setDescription(data.description || '')
        setIndexable(data.indexable)
        setSeoTitle(data.seoTitle || '')
        setSeoDescription(data.seoDescription || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load genre')
      } finally {
        setLoading(false)
      }
    }
    fetchGenre()
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    try {
      await adminApi.updateGenre(id, {
        name,
        description: description || null,
        indexable,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
      })
      const updated = await adminApi.getGenre(id)
      setGenre(updated)
      alert('Genre saved!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !genre) return
    if (genre.editionCount > 0) {
      alert('Cannot delete genre with editions')
      return
    }
    if (!confirm(`Are you sure you want to delete "${genre.name}"?`)) return
    try {
      await adminApi.deleteGenre(id)
      navigate('/genres')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) return <p>Loading...</p>
  if (error) return <div className="error-banner">{error}</div>
  if (!genre) return <p>Genre not found</p>

  return (
    <div className="edit-genre-page">
      <div className="edit-genre-page__header">
        <Link to="/genres" className="back-link">&larr; Back to Genres</Link>
        <h1>{genre.name}</h1>
        <span className="slug-badge">/{genre.slug}</span>
      </div>

      <form onSubmit={handleSave} className="edit-genre-form">
        <div className="form-section">
          <h2>Basic Info</h2>

          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Genre description..."
            />
          </div>
        </div>

        <div className="form-section">
          <h2>SEO</h2>

          <div className="form-group form-group--checkbox">
            <label>
              <input
                type="checkbox"
                checked={indexable}
                onChange={(e) => setIndexable(e.target.checked)}
              />
              Allow search engines to index this page
            </label>
          </div>

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

      {genre.editions.length > 0 && (
        <div className="form-section">
          <h2>Editions ({genre.editionCount})</h2>
          <table className="editions-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {genre.editions.map((edition) => (
                <tr key={edition.editionId}>
                  <td>
                    <Link to={`/editions/${edition.editionId}`}>{edition.title}</Link>
                  </td>
                  <td>
                    <span className={`badge badge--${edition.status.toLowerCase()}`}>
                      {edition.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-section form-section--danger">
        <h2>Danger Zone</h2>
        <p>Deleting a genre is permanent and cannot be undone.</p>
        <button
          type="button"
          onClick={handleDelete}
          className="btn btn--danger"
          disabled={genre.editionCount > 0}
        >
          Delete Genre
        </button>
        {genre.editionCount > 0 && (
          <p className="text-muted">Remove genre from all editions before deleting.</p>
        )}
      </div>
    </div>
  )
}
