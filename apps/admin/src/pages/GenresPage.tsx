import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, GenreListItem } from '../api/client'

const DEFAULT_SITE_ID = '11111111-1111-1111-1111-111111111111'

export function GenresPage() {
  const [genres, setGenres] = useState<GenreListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  const fetchGenres = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getGenres({
        siteId: DEFAULT_SITE_ID,
        search: search || undefined,
        offset,
        limit,
      })
      setGenres(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load genres')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGenres()
  }, [offset])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
    fetchGenres()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      await adminApi.deleteGenre(id)
      fetchGenres()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="genres-page">
      <div className="genres-page__header">
        <h1>Genres</h1>
        <span className="genres-page__count">{total} total</span>
      </div>

      <div className="genres-page__filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : genres.length === 0 ? (
        <p>No genres found.</p>
      ) : (
        <>
          <table className="genres-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Indexable</th>
                <th>Editions</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {genres.map((genre) => (
                <tr key={genre.id}>
                  <td>
                    <Link to={`/genres/${genre.id}`}>{genre.name}</Link>
                  </td>
                  <td className="slug-cell">{genre.slug}</td>
                  <td>{genre.indexable ? 'Yes' : 'No'}</td>
                  <td>{genre.editionCount}</td>
                  <td>{formatDate(genre.updatedAt)}</td>
                  <td className="actions-cell">
                    <Link to={`/genres/${genre.id}`} className="btn btn--small">
                      Edit
                    </Link>
                    {genre.editionCount === 0 && (
                      <button
                        onClick={() => handleDelete(genre.id, genre.name)}
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
