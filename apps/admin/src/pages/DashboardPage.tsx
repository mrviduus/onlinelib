import { Link } from 'react-router-dom'

export function DashboardPage() {
  return (
    <div className="dashboard-page">
      <h1>Admin Dashboard</h1>
      <p className="dashboard-page__subtitle">Welcome to TextStack Admin</p>

      <div className="dashboard-cards">
        <Link to="/upload" className="dashboard-card">
          <div className="dashboard-card__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3>Upload Book</h3>
          <p>Add new EPUB files to the library</p>
        </Link>

        <Link to="/jobs" className="dashboard-card">
          <div className="dashboard-card__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <h3>Ingestion Jobs</h3>
          <p>Monitor book processing status</p>
        </Link>

        <a href="http://localhost:5173/books" target="_blank" rel="noopener" className="dashboard-card">
          <div className="dashboard-card__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <h3>View Library</h3>
          <p>Open the public book library</p>
        </a>
      </div>
    </div>
  )
}
