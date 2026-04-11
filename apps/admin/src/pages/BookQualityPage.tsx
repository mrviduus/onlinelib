import { useState, useEffect } from 'react'
import { adminApi, BookQualityJobListItem, BookQualityJobStatus, BookQualityJobDetail, BookQualitySettings } from '../api/client'

export function BookQualityPage() {
  const [jobs, setJobs] = useState<BookQualityJobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<BookQualitySettings | null>(null)
  const [selectedJob, setSelectedJob] = useState<BookQualityJobDetail | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchJobs = async () => {
    try {
      const data = await adminApi.getBookQualityJobs({ limit: 50 })
      setJobs(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const s = await adminApi.getBookQualitySettings()
      setSettings(s)
    } catch {}
  }

  useEffect(() => {
    fetchJobs()
    fetchSettings()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedJob || (selectedJob.status !== 'Validating' && selectedJob.status !== 'Fixing')) return
    const interval = setInterval(async () => {
      try {
        const detail = await adminApi.getBookQualityJob(selectedJob.id)
        setSelectedJob(detail)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedJob?.id, selectedJob?.status])

  const handleToggleSetting = async (key: keyof BookQualitySettings) => {
    if (!settings) return
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    try {
      await adminApi.updateBookQualitySettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
      setSettings(settings)
    }
  }

  const handleCancel = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.cancelBookQualityJob(id)
      fetchJobs()
      if (selectedJob?.id === id) {
        setSelectedJob(await adminApi.getBookQualityJob(id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRetry = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.retryBookQualityJob(id)
      fetchJobs()
      if (selectedJob?.id === id) {
        setSelectedJob(await adminApi.getBookQualityJob(id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry')
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewDetail = async (id: string) => {
    try {
      setSelectedJob(await adminApi.getBookQualityJob(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  const getStatusBadge = (status: BookQualityJobStatus) => {
    const classes: Record<BookQualityJobStatus, string> = {
      Queued: 'badge badge--queued',
      Validating: 'badge badge--processing',
      Fixing: 'badge badge--processing',
      Completed: 'badge badge--success',
      Failed: 'badge badge--error',
      Cancelled: 'badge badge--cancelled',
    }
    return <span className={classes[status]}>{status}</span>
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleString()
  }

  const getBookTitle = (job: BookQualityJobListItem) => {
    return job.editionTitle || job.userBookTitle || 'Unknown'
  }

  const getBookType = (job: BookQualityJobListItem) => {
    return job.editionId ? 'Edition' : 'User Book'
  }

  if (loading) {
    return (
      <div className="seo-crawl-page">
        <h1>Book Quality</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="seo-crawl-page">
      <div className="page-header">
        <h1>Book Quality</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Settings */}
      {settings && (
        <div className="create-form" style={{ marginBottom: '1rem' }}>
          <h3>Settings</h3>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoQueueAfterIngestion}
                onChange={() => handleToggleSetting('autoQueueAfterIngestion')}
              />
              Auto-queue after ingestion (library books)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoQueueForUserBooks}
                onChange={() => handleToggleSetting('autoQueueForUserBooks')}
              />
              Auto-queue for user uploads
            </label>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedJob && (
        <div className="create-form" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Job Detail</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(selectedJob.status === 'Completed' || selectedJob.status === 'Failed' || selectedJob.status === 'Cancelled') && (
                <button onClick={() => handleRetry(selectedJob.id)} className="btn btn--small btn--primary" disabled={actionLoading === selectedJob.id}>Retry</button>
              )}
              <button onClick={() => setSelectedJob(null)} className="btn btn--small">Close</button>
            </div>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            {getStatusBadge(selectedJob.status)}
            {' '}
            <strong>{getBookTitle(selectedJob)}</strong>
            {' '}({getBookType(selectedJob)})
          </div>

          {selectedJob.issuesFound != null && (
            <p>Issues found: <strong>{selectedJob.issuesFound}</strong> | Fixed: <strong>{selectedJob.issuesFixed ?? 0}</strong></p>
          )}

          {selectedJob.issuesJson && (
            <div>
              <strong>Issues:</strong>
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {(() => {
                  try { return JSON.stringify(JSON.parse(selectedJob.issuesJson), null, 2) }
                  catch { return selectedJob.issuesJson }
                })()}
              </pre>
            </div>
          )}

          {selectedJob.error && <div className="error-banner">{selectedJob.error}</div>}

          {selectedJob.logOutput && (
            <div>
              <strong>Log:</strong>
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {selectedJob.logOutput}
              </pre>
            </div>
          )}

          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            Created: {formatDate(selectedJob.createdAt)}
            {selectedJob.startedAt && <> | Started: {formatDate(selectedJob.startedAt)}</>}
            {selectedJob.finishedAt && <> | Finished: {formatDate(selectedJob.finishedAt)}</>}
          </p>
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="empty-state">No quality validation jobs yet. Jobs are auto-created after book ingestion when enabled, or manually via edition page.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Book</th>
              <th>Type</th>
              <th>Issues</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id}>
                <td>{getStatusBadge(job.status)}</td>
                <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getBookTitle(job)}
                </td>
                <td>{getBookType(job)}</td>
                <td>
                  {job.issuesFound != null ? `${job.issuesFixed ?? 0}/${job.issuesFound}` : '-'}
                </td>
                <td>{formatDate(job.createdAt)}</td>
                <td className="actions-cell">
                  <button onClick={() => handleViewDetail(job.id)} className="btn btn--small">View</button>
                  {(job.status === 'Queued' || job.status === 'Validating' || job.status === 'Fixing') && (
                    <button onClick={() => handleCancel(job.id)} className="btn btn--small btn--danger" disabled={actionLoading === job.id}>Cancel</button>
                  )}
                  {(job.status === 'Completed' || job.status === 'Failed' || job.status === 'Cancelled') && (
                    <button onClick={() => handleRetry(job.id)} className="btn btn--small btn--primary" disabled={actionLoading === job.id}>Retry</button>
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
