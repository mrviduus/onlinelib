const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface IngestionJob {
  id: string
  editionId: string
  editionTitle: string
  status: 'Queued' | 'Processing' | 'Succeeded' | 'Failed'
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface UploadResponse {
  workId: string
  editionId: string
  bookFileId: string
  jobId: string
  message: string
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `API error: ${res.status}`)
  }
  return res.json()
}

// Default site ID for fiction site (seeded)
const DEFAULT_SITE_ID = '11111111-1111-1111-1111-111111111111'

export const adminApi = {
  uploadBook: async (file: File, title: string, language: string, siteId?: string): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('siteId', siteId || DEFAULT_SITE_ID)
    formData.append('title', title)
    formData.append('language', language)

    return fetchJson<UploadResponse>('/admin/books/upload', {
      method: 'POST',
      body: formData,
    })
  },

  getJobs: async (): Promise<IngestionJob[]> => {
    return fetchJson<IngestionJob[]>('/admin/ingestion/jobs')
  },

  getJob: async (id: string): Promise<IngestionJob> => {
    return fetchJson<IngestionJob>(`/admin/ingestion/jobs/${id}`)
  },
}
