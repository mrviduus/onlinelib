import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { UploadPage } from './pages/UploadPage'
import { JobsPage } from './pages/JobsPage'
import { EditionsPage } from './pages/EditionsPage'
import { EditEditionPage } from './pages/EditEditionPage'
import './styles/admin.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="editions" element={<EditionsPage />} />
          <Route path="editions/:id" element={<EditEditionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
