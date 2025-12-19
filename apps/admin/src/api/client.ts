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

export interface Edition {
  id: string
  slug: string
  title: string
  authorsJson: string | null
  status: 'Draft' | 'Published' | 'Deleted'
  chapterCount: number
  createdAt: string
  publishedAt: string | null
}

export interface EditionDetail {
  id: string
  workId: string
  siteId: string
  slug: string
  title: string
  language: string
  authorsJson: string | null
  description: string | null
  coverPath: string | null
  status: string
  isPublicDomain: boolean
  createdAt: string
  publishedAt: string | null
  chapters: Chapter[]
}

export interface Chapter {
  id: string
  chapterNumber: number
  slug: string
  title: string
  wordCount: number | null
}

export interface PaginatedResult<T> {
  total: number
  items: T[]
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `API error: ${res.status}`)
  }
  return res.json()
}

async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `API error: ${res.status}`)
  }
}

// Default site ID for general site (seeded)
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

  // Editions
  getEditions: async (params?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<PaginatedResult<Edition>> => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.search) query.set('search', params.search)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<Edition>>(`/admin/editions${qs ? `?${qs}` : ''}`)
  },

  getEdition: async (id: string): Promise<EditionDetail> => {
    return fetchJson<EditionDetail>(`/admin/editions/${id}`)
  },

  updateEdition: async (id: string, data: { title: string; authorsJson?: string | null; description?: string | null }): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}`, { method: 'DELETE' })
  },

  publishEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}/publish`, { method: 'POST' })
  },

  unpublishEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}/unpublish`, { method: 'POST' })
  },
}
