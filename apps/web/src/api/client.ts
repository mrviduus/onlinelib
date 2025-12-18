const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  getBooks: (params?: { limit?: number; offset?: number; language?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.language) query.set('language', params.language)
    const qs = query.toString()
    return fetchJson<{ total: number; books: import('../types/api').Edition[] }>(
      `/books${qs ? `?${qs}` : ''}`
    )
  },

  getBook: (slug: string) =>
    fetchJson<import('../types/api').BookDetail>(`/books/${slug}`),

  getChapter: (bookSlug: string, chapterSlug: string) =>
    fetchJson<import('../types/api').Chapter>(`/books/${bookSlug}/chapters/${chapterSlug}`),

  search: (q: string, params?: { limit?: number; offset?: number; language?: string }) => {
    const query = new URLSearchParams({ q })
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.language) query.set('language', params.language)
    return fetchJson<{ total: number; results: unknown[] }>(`/search?${query}`)
  },
}
