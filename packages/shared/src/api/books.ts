import { publicFetch } from './client'
import type { Edition, BookDetail, Chapter, SearchResult, Suggestion, Author, AuthorDetail, Genre, GenreDetail } from '../types/api'

export function createBooksApi(language: string) {
  const langPrefix = `/${language}`

  return {
    getBooks: (params?: { limit?: number; offset?: number; search?: string; genre?: string; sort?: string }) => {
      const query = new URLSearchParams()
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.offset) query.set('offset', String(params.offset))
      if (params?.search) query.set('search', params.search)
      if (params?.genre) query.set('genre', params.genre)
      if (params?.sort) query.set('sort', params.sort)
      const qs = query.toString()
      return publicFetch<{ total: number; items: Edition[] }>(
        `${langPrefix}/books${qs ? `?${qs}` : ''}`,
      )
    },

    getBook: (slug: string) => {
      return publicFetch<BookDetail>(`${langPrefix}/books/${slug}`)
    },

    getChapter: (bookSlug: string, chapterSlug: string) => {
      return publicFetch<Chapter>(`${langPrefix}/books/${bookSlug}/chapters/${chapterSlug}`)
    },

    search: (q: string, params?: { limit?: number; offset?: number; highlight?: boolean }) => {
      const query = new URLSearchParams({ q })
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.offset) query.set('offset', String(params.offset))
      if (params?.highlight) query.set('highlight', 'true')
      return publicFetch<{ total: number; items: SearchResult[] }>(`${langPrefix}/search?${query}`)
    },

    suggest: (q: string, params?: { limit?: number }) => {
      const query = new URLSearchParams({ q })
      if (params?.limit) query.set('limit', String(params.limit))
      return publicFetch<Suggestion[]>(`${langPrefix}/search/suggest?${query}`)
    },

    getAuthors: (params?: { limit?: number; offset?: number; sort?: 'name' | 'recent'; search?: string }) => {
      const query = new URLSearchParams()
      query.set('language', language)
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.offset) query.set('offset', String(params.offset))
      if (params?.sort) query.set('sort', params.sort)
      if (params?.search) query.set('search', params.search)
      return publicFetch<{ total: number; items: Author[] }>(`/authors?${query}`)
    },

    getAuthor: (slug: string) => {
      return publicFetch<AuthorDetail>(`/authors/${slug}`)
    },

    getGenres: () => {
      const query = new URLSearchParams({ language })
      return publicFetch<{ total: number; items: Genre[] }>(`/genres?${query}`)
    },

    getGenre: (slug: string) => {
      return publicFetch<GenreDetail>(`/genres/${slug}`)
    },
  }
}
