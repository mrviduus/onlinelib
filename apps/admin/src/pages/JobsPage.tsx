import { useState, useEffect } from 'react'
import { adminApi, IngestionJob } from '../api/client'
import { formatDate, getStatusBadge } from '../utils/badges'

export function JobsPage() {
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = async () => {
    try {
      const data = await adminApi.getJobs()
      setJobs(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="jobs-page">
        <h1>Ingestion Jobs</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <h1>Ingestion Jobs</h1>
        <button onClick={fetchJobs} className="refresh-btn">Refresh</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {jobs.length === 0 ? (
        <p>No jobs yet. Upload a book to start processing.</p>
      ) : (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Created</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.editionTitle}</td>
                <td>{getStatusBadge(job.status)}</td>
                <td>{formatDate(job.createdAt)}</td>
                <td>{formatDate(job.startedAt)}</td>
                <td>{formatDate(job.completedAt)}</td>
                <td className="error-cell">{job.errorMessage || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
