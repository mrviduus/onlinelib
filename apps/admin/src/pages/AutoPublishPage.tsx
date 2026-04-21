import { useState, useEffect } from 'react'
import {
  adminApi,
  AutoPublishSettings,
  AutoPublishJobListItem,
  AutoPublishJobDetail,
  CandidateEdition,
} from '../api/client'

const STATUS_COLORS: Record<string, string> = {
  Queued: '#6b7280',
  Running: '#3b82f6',
  GeneratingSeo: '#8b5cf6',
  AwaitingReview: '#f59e0b',
  Publishing: '#3b82f6',
  Completed: '#10b981',
  Failed: '#ef4444',
  Cancelled: '#6b7280',
}

export function AutoPublishPage() {
  const [settings, setSettings] = useState<AutoPublishSettings | null>(null)
  const [jobs, setJobs] = useState<AutoPublishJobListItem[]>([])
  const [candidates, setCandidates] = useState<CandidateEdition[]>([])
  const [selectedJob, setSelectedJob] = useState<AutoPublishJobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'jobs' | 'candidates'>('jobs')

  const fetchSettings = async () => {
    try {
      const s = await adminApi.getAutoPublishSettings()
      setSettings(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    }
  }

  const fetchJobsAndCandidates = async () => {
    try {
      const [j, c] = await Promise.all([
        adminApi.getAutoPublishJobs({ limit: 50 }),
        adminApi.getAutoPublishCandidates(20),
      ])
      setJobs(j.items)
      setCandidates(c)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const fetchAll = async () => {
    await Promise.all([fetchSettings(), fetchJobsAndCandidates()])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    // Only auto-refresh jobs/candidates, not settings (to avoid overwriting local edits)
    const interval = setInterval(fetchJobsAndCandidates, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedJob || !['Running', 'GeneratingSeo', 'Publishing'].includes(selectedJob.status)) return
    const interval = setInterval(async () => {
      try {
        const detail = await adminApi.getAutoPublishJob(selectedJob.id)
        setSelectedJob(detail)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedJob?.id, selectedJob?.status])

  const handleSaveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await adminApi.updateAutoPublishSettings(settings)
      await fetchSettings()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleAction = async (action: () => Promise<void>, label: string) => {
    try {
      await action()
      setError(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${label}`)
    }
  }

  const handleTrigger = async () => {
    setActionLoading('trigger')
    try {
      await adminApi.triggerAutoPublish()
      setError(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger')
    } finally {
      setActionLoading(null)
    }
  }

  const handleQueue = async (editionId: string) => {
    setActionLoading(editionId)
    try {
      await adminApi.queueAutoPublishEdition(editionId)
      setError(null)
      fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="page-loading">Loading...</div>

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200 }}>
      <h1>Auto Publish</h1>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Settings */}
      {settings && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Settings</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <label>
              Books/day
              <input
                type="number"
                min={1}
                max={10}
                value={settings.booksPerDay}
                onChange={e => setSettings({ ...settings, booksPerDay: Number(e.target.value) })}
                style={{ width: 60, marginLeft: 8 }}
              />
            </label>
            <label>
              Hour (UTC)
              <select
                value={settings.hourUtc}
                onChange={e => setSettings({ ...settings, hourUtc: Number(e.target.value) })}
                style={{ marginLeft: 8 }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.requireReview}
                onChange={e => setSettings({ ...settings, requireReview: e.target.checked })}
              />
              Require review
            </label>
            <label>
              Language
              <select
                value={settings.language}
                onChange={e => setSettings({ ...settings, language: e.target.value })}
                style={{ marginLeft: 8 }}
              >
                <option value="">All</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <button className={`btn ${tab === 'jobs' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('jobs')}>
          Jobs ({jobs.length})
        </button>
        <button className={`btn ${tab === 'candidates' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('candidates')}>
          Candidates ({candidates.length})
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-success"
          onClick={handleTrigger}
          disabled={actionLoading === 'trigger'}
        >
          {actionLoading === 'trigger' ? 'Creating...' : 'Publish Next Now'}
        </button>
      </div>

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <>
          {selectedJob && (
            <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{selectedJob.editionTitle}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedJob(null)}>Close</button>
              </div>
              <p>
                <span className="badge" style={{ background: STATUS_COLORS[selectedJob.status] }}>{selectedJob.status}</span>
                {selectedJob.generatedEditionSeo && <span className="badge" style={{ background: '#8b5cf6', marginLeft: 4 }}>Edition SEO</span>}
                {selectedJob.generatedAuthorSeo && <span className="badge" style={{ background: '#8b5cf6', marginLeft: 4 }}>Author SEO</span>}
                {selectedJob.priority && <span className="badge" style={{ background: '#f59e0b', marginLeft: 4 }}>Priority</span>}
              </p>
              {selectedJob.error && <p style={{ color: '#ef4444' }}>Error: {selectedJob.error}</p>}
              {selectedJob.logOutput && (
                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '0.75rem', borderRadius: 6, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
                  {selectedJob.logOutput}
                </pre>
              )}
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Edition</th>
                <th>SEO</th>
                <th>Created</th>
                <th>Finished</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No jobs yet</td></tr>
              )}
              {jobs.map(job => (
                <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => {
                  adminApi.getAutoPublishJob(job.id).then(setSelectedJob)
                }}>
                  <td>
                    <span className="badge" style={{ background: STATUS_COLORS[job.status], color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      {job.status}
                    </span>
                    {job.priority && <span style={{ marginLeft: 4, color: '#f59e0b' }} title="Priority">*</span>}
                  </td>
                  <td>{job.editionTitle}</td>
                  <td>
                    {job.generatedEditionSeo && <span title="Edition SEO generated">E</span>}
                    {job.generatedAuthorSeo && <span title="Author SEO generated"> A</span>}
                  </td>
                  <td>{new Date(job.createdAt).toLocaleDateString()}</td>
                  <td>{job.finishedAt ? new Date(job.finishedAt).toLocaleDateString() : '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {job.status === 'AwaitingReview' && (
                      <>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleAction(() => adminApi.approveAutoPublishJob(job.id), 'approve')}
                        >Approve</button>{' '}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleAction(() => adminApi.rejectAutoPublishJob(job.id), 'reject')}
                        >Reject</button>
                      </>
                    )}
                    {(job.status === 'Failed' || job.status === 'Cancelled') && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleAction(() => adminApi.retryAutoPublishJob(job.id), 'retry')}
                      >Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Candidates tab */}
      {tab === 'candidates' && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Lang</th>
              <th>Chapters</th>
              <th>SEO Ready</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No candidates</td></tr>
            )}
            {candidates.map(c => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.language || '—'}</td>
                <td>{c.chapterCount}</td>
                <td>
                  <span style={{ color: c.hasDescription ? '#10b981' : '#ef4444' }}>D</span>
                  <span style={{ color: c.hasRelevance ? '#10b981' : '#ef4444' }}>R</span>
                  <span style={{ color: c.hasThemes ? '#10b981' : '#ef4444' }}>T</span>
                  <span style={{ color: c.hasFaqs ? '#10b981' : '#ef4444' }}>F</span>
                </td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={actionLoading === c.id}
                    onClick={() => handleQueue(c.id)}
                  >
                    {actionLoading === c.id ? 'Queuing...' : 'Queue'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
