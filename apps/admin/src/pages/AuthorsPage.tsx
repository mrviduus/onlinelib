import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, AuthorListItem } from '../api/client'

const DEFAULT_SITE_ID = '11111111-1111-1111-1111-111111111111'

export function AuthorsPage() {
  const [authors, setAuthors] = useState<AuthorListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  const fetchAuthors = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getAuthors({
        siteId: DEFAULT_SITE_ID,
        search: search || undefined,
        offset,
        limit,
      })
      setAuthors(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load authors')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuthors()
  }, [offset])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
    fetchAuthors()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      await adminApi.deleteAuthor(id)
      fetchAuthors()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="authors-page">
      <div className="authors-page__header">
        <h1>Authors</h1>
        <span className="authors-page__count">{total} total</span>
      </div>

      <div className="authors-page__filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : authors.length === 0 ? (
        <p>No authors found.</p>
      ) : (
        <>
          <table className="authors-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Books</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {authors.map((author) => (
                <tr key={author.id}>
                  <td className="authors-table__photo-cell">
                    {author.photoPath ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/storage/${author.photoPath}`}
                        alt={author.name}
                        className="authors-table__photo"
                      />
                    ) : (
                      <div className="authors-table__photo-placeholder" />
                    )}
                  </td>
                  <td>
                    <Link to={`/authors/${author.id}`}>{author.name}</Link>
                  </td>
                  <td>{author.bookCount}</td>
                  <td>{formatDate(author.createdAt)}</td>
                  <td className="actions-cell">
                    <Link to={`/authors/${author.id}`} className="btn btn--small">
                      Edit
                    </Link>
                    {author.bookCount === 0 && (
                      <button
                        onClick={() => handleDelete(author.id, author.name)}
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

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="btn btn--small"
              >
                Previous
              </button>
              <span className="pagination__info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="btn btn--small"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
