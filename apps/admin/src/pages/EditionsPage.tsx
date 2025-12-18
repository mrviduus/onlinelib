import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, Edition } from '../api/client'

export function EditionsPage() {
  const [editions, setEditions] = useState<Edition[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const fetchEditions = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getEditions({
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setEditions(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load editions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEditions()
  }, [statusFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEditions()
  }

  const handlePublish = async (id: string) => {
    try {
      await adminApi.publishEdition(id)
      fetchEditions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish')
    }
  }

  const handleUnpublish = async (id: string) => {
    try {
      await adminApi.unpublishEdition(id)
      fetchEditions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this edition?')) return
    try {
      await adminApi.deleteEdition(id)
      fetchEditions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      Draft: 'badge badge--draft',
      Published: 'badge badge--success',
      Deleted: 'badge badge--error',
    }
    return <span className={classes[status] || 'badge'}>{status}</span>
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  return (
    <div className="editions-page">
      <div className="editions-page__header">
        <h1>Editions</h1>
        <span className="editions-page__count">{total} total</span>
      </div>

      <div className="editions-page__filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by title or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="status-filter"
        >
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Published">Published</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : editions.length === 0 ? (
        <p>No editions found.</p>
      ) : (
        <table className="editions-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Authors</th>
              <th>Status</th>
              <th>Chapters</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {editions.map((edition) => (
              <tr key={edition.id}>
                <td>
                  <Link to={`/editions/${edition.id}`}>{edition.title}</Link>
                </td>
                <td>{edition.authorsJson || '-'}</td>
                <td>{getStatusBadge(edition.status)}</td>
                <td>{edition.chapterCount}</td>
                <td>{formatDate(edition.createdAt)}</td>
                <td className="actions-cell">
                  <Link to={`/editions/${edition.id}`} className="btn btn--small">
                    Edit
                  </Link>
                  {edition.status === 'Draft' && (
                    <button
                      onClick={() => handlePublish(edition.id)}
                      className="btn btn--small btn--success"
                    >
                      Publish
                    </button>
                  )}
                  {edition.status === 'Published' && (
                    <button
                      onClick={() => handleUnpublish(edition.id)}
                      className="btn btn--small btn--warning"
                    >
                      Unpublish
                    </button>
                  )}
                  {edition.status !== 'Published' && (
                    <button
                      onClick={() => handleDelete(edition.id)}
                      className="btn btn--small btn--danger"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
