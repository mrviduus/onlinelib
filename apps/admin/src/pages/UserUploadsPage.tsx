import { useState, useEffect } from 'react'
import { adminApi, UserUploadListItem, UserUploadStats } from '../api/client'
import { formatDate, formatSize, getStatusBadge } from '../utils/badges'

const PAGE_SIZE = 20

export function UserUploadsPage() {
  const [items, setItems] = useState<UserUploadListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [userTypeFilter, setUserTypeFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState<UserUploadStats | null>(null)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const fetchStats = async () => {
    try {
      const data = await adminApi.getUserUploadStats()
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const fetchItems = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getUserUploads({
        status: statusFilter || undefined,
        userType: userTypeFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      setItems(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load uploads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchItems()
  }, [statusFilter, userTypeFilter, page])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchItems()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user book and all its data?')) return
    try {
      await adminApi.deleteUserUpload(id)
      fetchItems()
      fetchStats()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleTakedown = async (id: string) => {
    const reason = prompt(
      'Takedown reason (e.g. DMCA claim from rightsholder, policy violation). ' +
      'Stored for audit; hides the book from user.'
    )
    if (!reason || !reason.trim()) return
    try {
      await adminApi.takedownUserUpload(id, reason.trim())
      fetchItems()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to takedown')
    }
  }

  return (
    <div className="user-uploads-page">
      <div className="user-uploads-page__header">
        <h1>User Uploads</h1>
        <span className="user-uploads-page__count">{total} total</span>
      </div>

      {stats && (
        <div className="stats-cards">
          <div className="stats-card">
            <div className="stats-card__value">{stats.total}</div>
            <div className="stats-card__label">Total</div>
          </div>
          <div className="stats-card stats-card--processing">
            <div className="stats-card__value">{stats.processing}</div>
            <div className="stats-card__label">Processing</div>
          </div>
          <div className="stats-card stats-card--success">
            <div className="stats-card__value">{stats.ready}</div>
            <div className="stats-card__label">Ready</div>
          </div>
          <div className="stats-card stats-card--error">
            <div className="stats-card__value">{stats.failed}</div>
            <div className="stats-card__label">Failed</div>
          </div>
          <div className="stats-card stats-card--draft">
            <div className="stats-card__value">{stats.guestUploads}</div>
            <div className="stats-card__label">Guest</div>
          </div>
          <div className="stats-card">
            <div className="stats-card__value">{formatSize(stats.totalStorageBytes)}</div>
            <div className="stats-card__label">Storage</div>
          </div>
        </div>
      )}

      <div className="user-uploads-page__filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search by title, author, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="status-filter"
        >
          <option value="">All statuses</option>
          <option value="Processing">Processing</option>
          <option value="Ready">Ready</option>
          <option value="Failed">Failed</option>
        </select>

        <select
          value={userTypeFilter}
          onChange={(e) => { setUserTypeFilter(e.target.value); setPage(1) }}
          className="status-filter"
        >
          <option value="">All users</option>
          <option value="guest">Guest</option>
          <option value="registered">Registered</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>No uploads found.</p>
      ) : (
        <table className="user-uploads-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>User</th>
              <th>Format</th>
              <th>Status</th>
              <th>Chapters</th>
              <th>Words</th>
              <th>Size</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td title={item.originalFileName || undefined}>{item.title}</td>
                <td>{item.author || '-'}</td>
                <td>
                  {item.userEmail}
                  {item.isGuest && <span className="badge badge--draft" style={{ marginLeft: 6 }}>Guest</span>}
                </td>
                <td>{item.sourceFormat || '-'}</td>
                <td>
                  {getStatusBadge(item.status)}
                  {item.errorMessage && (
                    <span title={item.errorMessage} style={{ marginLeft: 4, cursor: 'help', color: '#c62828' }}>!</span>
                  )}
                  {item.takedownAt && (
                    <span
                      className="badge badge--error"
                      title={`Taken down ${new Date(item.takedownAt).toLocaleString()}: ${item.takedownReason || ''}`}
                      style={{ marginLeft: 6 }}
                    >
                      Takedown
                    </span>
                  )}
                </td>
                <td>{item.chapterCount}</td>
                <td>{item.totalWordCount?.toLocaleString() || '-'}</td>
                <td>{formatSize(item.fileSize)}</td>
                <td>{formatDate(item.createdAt)}</td>
                <td className="actions-cell">
                  {!item.takedownAt && (
                    <button onClick={() => handleTakedown(item.id)} className="btn btn--small" style={{ marginRight: 4 }}>
                      Takedown
                    </button>
                  )}
                  <button onClick={() => handleDelete(item.id)} className="btn btn--small btn--danger">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn--small"
          >
            ← Prev
          </button>
          <span className="pagination__info">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn btn--small"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
