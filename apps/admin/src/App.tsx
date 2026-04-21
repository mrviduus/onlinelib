import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { UploadPage } from './pages/UploadPage'
import { JobsPage } from './pages/JobsPage'
import { EditionsPage } from './pages/EditionsPage'
import { EditEditionPage } from './pages/EditEditionPage'
import { AuthorsPage } from './pages/AuthorsPage'
import { CreateAuthorPage } from './pages/CreateAuthorPage'
import { EditAuthorPage } from './pages/EditAuthorPage'
import { GenresPage } from './pages/GenresPage'
import { CreateGenrePage } from './pages/CreateGenrePage'
import { EditGenrePage } from './pages/EditGenrePage'
import { BlogPostsPage } from './pages/BlogPostsPage'
import { CreateBlogPostPage } from './pages/CreateBlogPostPage'
import { EditBlogPostPage } from './pages/EditBlogPostPage'
import { EditChapterPage } from './pages/EditChapterPage'
import { ToolsPage } from './pages/ToolsPage'
import { SsgRebuildPage } from './pages/SsgRebuildPage'
import { SsgRebuildJobPage } from './pages/SsgRebuildJobPage'
import { SettingsPage } from './pages/SettingsPage'
import { CodeGenPage } from './pages/CodeGenPage'
import { AutoPublishPage } from './pages/AutoPublishPage'
import { SeoBackfillPage } from './pages/SeoBackfillPage'
import { BookQualityPage } from './pages/BookQualityPage'
import { TaskBoardPage } from './pages/TaskBoardPage'
import { UserUploadsPage } from './pages/UserUploadsPage'
import { HighlightReportsPage } from './pages/HighlightReportsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import './styles/admin.css'

function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="task-board" element={<TaskBoardPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="user-uploads" element={<UserUploadsPage />} />
            <Route path="editions" element={<EditionsPage />} />
            <Route path="editions/:id" element={<EditEditionPage />} />
            <Route path="chapters/:id" element={<EditChapterPage />} />
            <Route path="authors" element={<AuthorsPage />} />
            <Route path="authors/new" element={<CreateAuthorPage />} />
            <Route path="authors/:id" element={<EditAuthorPage />} />
            <Route path="genres" element={<GenresPage />} />
            <Route path="genres/new" element={<CreateGenrePage />} />
            <Route path="genres/:id" element={<EditGenrePage />} />
            <Route path="blog" element={<BlogPostsPage />} />
            <Route path="blog/new" element={<CreateBlogPostPage />} />
            <Route path="blog/:id" element={<EditBlogPostPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="ssg-rebuild" element={<SsgRebuildPage />} />
            <Route path="ssg-rebuild/:id" element={<SsgRebuildJobPage />} />
            <Route path="codegen" element={<CodeGenPage />} />
            <Route path="autopublish" element={<AutoPublishPage />} />
            <Route path="seo-backfill" element={<SeoBackfillPage />} />
            <Route path="quality" element={<BookQualityPage />} />
            <Route path="highlight-reports" element={<HighlightReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AdminAuthProvider>
    </BrowserRouter>
  )
}

export default App
