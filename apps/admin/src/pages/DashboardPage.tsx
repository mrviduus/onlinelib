import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, AdminStats, IngestionJob, GenreStats, DEFAULT_SITE_ID } from '../api/client'

export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [genreStats, setGenreStats] = useState<GenreStats | null>(null)
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminApi.getStats().catch(() => null),
      adminApi.getGenreStats(DEFAULT_SITE_ID).catch(() => null),
      adminApi.getJobs().catch(() => []),
    ]).then(([s, g, j]) => {
      setStats(s)
      setGenreStats(g)
      setJobs(j)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="dashboard-page">
        <h1>Dashboard</h1>
        <p className="dashboard-page__subtitle">Loading...</p>
      </div>
    )
  }

  const recentJobs = jobs.slice(0, 5)

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>

      {/* Stats Grid */}
      <div className="dashboard-stats">
        <StatCard label="Published" value={stats?.publishedEditions ?? 0} icon="book" color="#059669" />
        <StatCard label="Drafts" value={stats?.draftEditions ?? 0} icon="draft" color="#d97706" />
        <StatCard label="Authors" value={stats?.totalAuthors ?? 0} icon="people" color="#7c3aed" />
        <StatCard label="Chapters" value={stats?.totalChapters ?? 0} icon="chapter" color="#2563eb" />
        <StatCard label="Genres" value={genreStats?.total ?? 0} icon="genre" color="#db2777" />
        <StatCard label="Users" value={stats?.totalUsers ?? 0} icon="users" color="#0891b2" />
      </div>

      {/* Recent Jobs */}
      <div className="dashboard-sections">
        <div className="dashboard-section-card">
          <div className="dashboard-section-header">
            <h2>Recent Jobs</h2>
            <Link to="/jobs" className="dashboard-section-link">View all →</Link>
          </div>
          {recentJobs.length === 0 ? (
            <p className="dashboard-empty">No ingestion jobs yet</p>
          ) : (
            <div className="dashboard-job-list">
              {recentJobs.map(job => (
                <div key={job.id} className="dashboard-job-item">
                  <span className={`dashboard-job-status dashboard-job-status--${job.status.toLowerCase()}`} />
                  <span className="dashboard-job-title">{job.editionTitle || 'Untitled'}</span>
                  <span className="dashboard-job-time">{timeAgo(job.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="dashboard-actions-title">Quick Actions</h2>
      <div className="dashboard-actions">
        <Link to="/upload" className="dashboard-action">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Book
        </Link>
        <Link to="/jobs" className="dashboard-action">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          Jobs
        </Link>
        <Link to="/editions" className="dashboard-action">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Editions
        </Link>
        <Link to="/settings" className="dashboard-action">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </div>
    </div>
  )
}

const ICONS: Record<string, JSX.Element> = {
  book: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  draft: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  people: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  chapter: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  genre: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  users: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-card__icon" style={{ color }}>{ICONS[icon]}</div>
      <div className="dashboard-stat-card__value">{value.toLocaleString()}</div>
      <div className="dashboard-stat-card__label">{label}</div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
