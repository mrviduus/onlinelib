import { useState, useEffect, useCallback } from 'react'
import { adminApi, type HighlightReport } from '../api/client'

type StatusFilter = 'open' | 'resolved' | 'all'

export function HighlightReportsPage() {
  const [items, setItems] = useState<HighlightReport[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const limit = 50

  const load = useCallback(() => {
    setLoading(true)
    adminApi.getHighlightReports({ status, limit, offset })
      .then(res => { setItems(res.items); setTotalCount(res.totalCount); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [status, offset])

  useEffect(() => { load() }, [load, refreshKey])

  const resolve = async (id: string, action: 'dismiss' | 'delete') => {
    const confirmMsg = action === 'delete'
      ? 'Delete this highlight (soft-delete) and mark report resolved?'
      : 'Dismiss this report?'
    if (!window.confirm(confirmMsg)) return
    try {
      await adminApi.resolveHighlightReport(id, action)
      setRefreshKey(k => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Highlight Reports</h1>
        <div className="admin-page__actions">
          <select
            value={status}
            onChange={(e) => { setOffset(0); setStatus(e.target.value as StatusFilter) }}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => setRefreshKey(k => k + 1)}>Refresh</button>
        </div>
      </header>

      {error && <div className="admin-error">{error}</div>}
      {loading && <div className="admin-loading">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="admin-empty">No reports.</div>
      )}

      {!loading && items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reported</th>
              <th>Reason</th>
              <th>Highlight</th>
              <th>Note</th>
              <th>Book / Chapter</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} style={r.highlightIsDeleted ? { opacity: 0.6 } : undefined}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td><strong>{r.reason}</strong>{r.note ? <div style={{ fontSize: 12, color: '#666' }}>{r.note}</div> : null}</td>
                <td style={{ maxWidth: 280 }}>
                  <div style={{ fontStyle: 'italic' }}>“{truncate(r.selectedText, 120)}”</div>
                </td>
                <td style={{ maxWidth: 280 }}>{r.noteText ? truncate(r.noteText, 160) : <span style={{ color: '#999' }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>
                  {r.editionTitle || '—'}<br />
                  <span style={{ color: '#666' }}>{r.chapterTitle || ''}</span>
                </td>
                <td>
                  {r.resolvedAt
                    ? <span style={{ color: '#666' }}>{r.resolution}</span>
                    : <span style={{ color: '#b45309' }}>open</span>}
                </td>
                <td>
                  {!r.resolvedAt && (
                    <>
                      <button onClick={() => resolve(r.id, 'dismiss')}>Dismiss</button>
                      {' '}
                      <button
                        onClick={() => resolve(r.id, 'delete')}
                        style={{ color: '#b91c1c' }}
                        disabled={r.highlightIsDeleted}
                      >
                        Delete highlight
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="admin-pagination">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
        <span>{offset + 1}–{Math.min(offset + items.length, totalCount)} / {totalCount}</span>
        <button disabled={offset + limit >= totalCount} onClick={() => setOffset(offset + limit)}>Next</button>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
