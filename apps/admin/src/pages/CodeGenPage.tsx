import { useState, useEffect } from 'react'
import { adminApi, CodeGenJobListItem, CodeGenJobStatus, CodeGenJobDetail } from '../api/client'

export function CodeGenPage() {
  const [jobs, setJobs] = useState<CodeGenJobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [description, setDescription] = useState('')
  const [maxIterations, setMaxIterations] = useState(10)
  const [creating, setCreating] = useState(false)

  // Detail view
  const [selectedJob, setSelectedJob] = useState<CodeGenJobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchJobs = async () => {
    try {
      const data = await adminApi.getCodeGenJobs({ limit: 50 })
      setJobs(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh selected job detail
  useEffect(() => {
    if (!selectedJob || selectedJob.status !== 'Running') return
    const interval = setInterval(async () => {
      try {
        const detail = await adminApi.getCodeGenJob(selectedJob.id)
        setSelectedJob(detail)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedJob?.id, selectedJob?.status])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setCreating(true)
    try {
      await adminApi.createCodeGenJob({ description: description.trim(), maxIterations })
      setShowCreate(false)
      setDescription('')
      setMaxIterations(10)
      setError(null)
      fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setCreating(false)
    }
  }

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleStart = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.startCodeGenJob(id)
      setError(null)
      fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.cancelCodeGenJob(id)
      setError(null)
      fetchJobs()
      if (selectedJob?.id === id) {
        const detail = await adminApi.getCodeGenJob(id)
        setSelectedJob(detail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRerun = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.rerunCodeGenJob(id)
      setError(null)
      fetchJobs()
      if (selectedJob?.id === id) {
        const detail = await adminApi.getCodeGenJob(id)
        setSelectedJob(detail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rerun')
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const detail = await adminApi.getCodeGenJob(id)
      setSelectedJob(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job')
    } finally {
      setDetailLoading(false)
    }
  }

  const getStatusBadge = (status: CodeGenJobStatus) => {
    const classes: Record<CodeGenJobStatus, string> = {
      Queued: 'badge badge--queued',
      Running: 'badge badge--processing',
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

  const getProgressPercent = (job: CodeGenJobListItem) => {
    if (job.maxIterations === 0) return 0
    return Math.round((job.completedIterations / job.maxIterations) * 100)
  }

  if (loading) {
    return (
      <div className="seo-crawl-page">
        <h1>CodeGen</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="seo-crawl-page">
      <div className="page-header">
        <h1>CodeGen</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="btn btn--primary">
          {showCreate ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="create-form">
          <h3>Create CodeGen Task</h3>
          <p className="form-description">
            Describe a feature or task. Claude Code will implement it in a loop and create a PR.
          </p>

          <div className="form-row">
            <label>
              Description
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe the feature or task to implement..."
                style={{ width: '100%', resize: 'vertical' }}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Max Iterations
              <input
                type="number"
                value={maxIterations}
                onChange={e => setMaxIterations(Number(e.target.value))}
                min={1}
                max={50}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={creating || !description.trim()}>
              {creating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {detailLoading && <p>Loading detail...</p>}

      {/* Detail panel */}
      {selectedJob && (
        <div className="create-form" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Job Detail</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(selectedJob.status === 'Completed' || selectedJob.status === 'Failed' || selectedJob.status === 'Cancelled') && (
                <button onClick={() => handleRerun(selectedJob.id)} className="btn btn--small btn--primary" disabled={actionLoading === selectedJob.id}>Rerun</button>
              )}
              <button onClick={() => setSelectedJob(null)} className="btn btn--small">Close</button>
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            {getStatusBadge(selectedJob.status)}
            {' '}
            <strong>{selectedJob.completedIterations}/{selectedJob.maxIterations}</strong> iterations
          </div>
          <p style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-secondary, #f5f5f5)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.9rem' }}>
            {selectedJob.description}
          </p>
          {selectedJob.branchName && (
            <p><strong>Branch:</strong> {selectedJob.branchName}</p>
          )}
          {(selectedJob.status === 'Running' || selectedJob.status === 'Completed') && (
            <p>
              <strong>PDD:</strong>{' '}
              <a
                href={`https://github.com/mrviduus/textstack/blob/${selectedJob.branchName || 'main'}/docs/05-features/codegen-${selectedJob.id.substring(0, 8)}.md`}
                target="_blank"
                rel="noreferrer"
              >
                codegen-{selectedJob.id.substring(0, 8)}.md
              </a>
            </p>
          )}
          {selectedJob.prUrl && (
            <p><strong>PR:</strong> <a href={selectedJob.prUrl} target="_blank" rel="noreferrer">{selectedJob.prUrl}</a></p>
          )}
          {selectedJob.error && (
            <div className="error-banner">{selectedJob.error}</div>
          )}
          {selectedJob.logOutput && (
            <div>
              <strong>Last output:</strong>
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', maxHeight: '300px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
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
        <p className="empty-state">No codegen jobs yet. Create one to start.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Description</th>
              <th>Progress</th>
              <th>PR</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id}>
                <td>{getStatusBadge(job.status)}</td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.description}
                </td>
                <td>
                  <div className="progress-cell">
                    <div className="progress-bar">
                      <div
                        className="progress-bar__fill"
                        style={{ width: `${getProgressPercent(job)}%` }}
                      />
                    </div>
                    <span>{job.completedIterations}/{job.maxIterations}</span>
                  </div>
                </td>
                <td>
                  {job.prUrl ? (
                    <a href={job.prUrl} target="_blank" rel="noreferrer" className="btn btn--small">PR</a>
                  ) : '-'}
                </td>
                <td>{formatDate(job.createdAt)}</td>
                <td className="actions-cell">
                  <button onClick={() => handleViewDetail(job.id)} className="btn btn--small">View</button>
                  {job.status === 'Queued' && (
                    <button onClick={() => handleStart(job.id)} className="btn btn--small btn--primary" disabled={actionLoading === job.id}>Start</button>
                  )}
                  {(job.status === 'Queued' || job.status === 'Running') && (
                    <button onClick={() => handleCancel(job.id)} className="btn btn--small btn--danger" disabled={actionLoading === job.id}>Cancel</button>
                  )}
                  {(job.status === 'Completed' || job.status === 'Failed' || job.status === 'Cancelled') && (
                    <button onClick={() => handleRerun(job.id)} className="btn btn--small btn--primary" disabled={actionLoading === job.id}>Rerun</button>
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
