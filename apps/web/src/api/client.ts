const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getSiteFromHost(): string {
  const host = window.location.hostname
  const subdomain = host.split('.')[0]
  if (subdomain === 'programming') return 'programming'
  if (subdomain === 'general') return 'general'
  return import.meta.env.VITE_SITE || 'general'
}

function addSiteParam(query: URLSearchParams): void {
  if (!query.has('site')) query.set('site', getSiteFromHost())
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function createApi(language: string) {
  const langPrefix = `/${language}`

  return {
    getBooks: (params?: { limit?: number; offset?: number }) => {
      const query = new URLSearchParams()
      addSiteParam(query)
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.offset) query.set('offset', String(params.offset))
      return fetchJson<{ total: number; items: import('../types/api').Edition[] }>(
        `${langPrefix}/books?${query}`
      )
    },

    getBook: (slug: string) => {
      const query = new URLSearchParams()
      addSiteParam(query)
      return fetchJson<import('../types/api').BookDetail>(`${langPrefix}/books/${slug}?${query}`)
    },

    getChapter: (bookSlug: string, chapterSlug: string) => {
      const query = new URLSearchParams()
      addSiteParam(query)
      return fetchJson<import('../types/api').Chapter>(
        `${langPrefix}/books/${bookSlug}/chapters/${chapterSlug}?${query}`
      )
    },

    search: (q: string, params?: { limit?: number; offset?: number; highlight?: boolean }) => {
      const query = new URLSearchParams({ q })
      addSiteParam(query)
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.offset) query.set('offset', String(params.offset))
      if (params?.highlight) query.set('highlight', 'true')
      return fetchJson<{ total: number; items: import('../types/api').SearchResult[] }>(
        `${langPrefix}/search?${query}`
      )
    },

    suggest: (q: string, params?: { limit?: number }) => {
      const query = new URLSearchParams({ q })
      addSiteParam(query)
      if (params?.limit) query.set('limit', String(params.limit))
      return fetchJson<import('../types/api').Suggestion[]>(`${langPrefix}/search/suggest?${query}`)
    },

    getAuthors: () => {
      const query = new URLSearchParams()
      addSiteParam(query)
      query.set('language', language)
      return fetchJson<{ total: number; items: import('../types/api').Author[] }>(`/authors?${query}`)
    },

    getAuthor: (slug: string) => {
      const query = new URLSearchParams()
      addSiteParam(query)
      return fetchJson<import('../types/api').AuthorDetail>(`/authors/${slug}?${query}`)
    },

    getGenres: () => {
      const query = new URLSearchParams()
      addSiteParam(query)
      return fetchJson<{ total: number; items: import('../types/api').Genre[] }>(`/genres?${query}`)
    },

    getGenre: (slug: string) => {
      const query = new URLSearchParams()
      addSiteParam(query)
      return fetchJson<import('../types/api').GenreDetail>(`/genres/${slug}?${query}`)
    },
  }
}

// Legacy API for backwards compatibility (uses default language)
export const api = createApi('uk')
