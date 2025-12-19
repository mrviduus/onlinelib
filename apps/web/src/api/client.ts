const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
// Dev mode: use site query param (general site by default)
const DEFAULT_SITE = import.meta.env.VITE_SITE || 'general'

function addSiteParam(query: URLSearchParams): void {
  if (!query.has('site')) query.set('site', DEFAULT_SITE)
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  getBooks: (params?: { limit?: number; offset?: number; language?: string }) => {
    const query = new URLSearchParams()
    addSiteParam(query)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.language) query.set('language', params.language)
    return fetchJson<{ total: number; items: import('../types/api').Edition[] }>(
      `/books?${query}`
    )
  },

  getBook: (slug: string) => {
    const query = new URLSearchParams()
    addSiteParam(query)
    return fetchJson<import('../types/api').BookDetail>(`/books/${slug}?${query}`)
  },

  getChapter: (bookSlug: string, chapterSlug: string) => {
    const query = new URLSearchParams()
    addSiteParam(query)
    return fetchJson<import('../types/api').Chapter>(`/books/${bookSlug}/chapters/${chapterSlug}?${query}`)
  },

  search: (q: string, params?: { limit?: number; offset?: number; language?: string }) => {
    const query = new URLSearchParams({ q })
    addSiteParam(query)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.language) query.set('language', params.language)
    return fetchJson<{ total: number; results: unknown[] }>(`/search?${query}`)
  },
}
