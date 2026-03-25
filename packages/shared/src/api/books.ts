import { publicFetch, buildQuery } from './client'
import type { Edition, BookDetail, Chapter, SearchResult, Suggestion, Author, AuthorDetail, Genre, GenreDetail } from '../types/api'

export function createBooksApi(language: string) {
  const langPrefix = `/${language}`

  return {
    getBooks: (params?: { limit?: number; offset?: number; search?: string; genre?: string; sort?: string }) => {
      return publicFetch<{ total: number; items: Edition[] }>(
        `${langPrefix}/books${buildQuery({ limit: params?.limit, offset: params?.offset, search: params?.search, genre: params?.genre, sort: params?.sort })}`,
      )
    },

    getBook: (slug: string) => {
      return publicFetch<BookDetail>(`${langPrefix}/books/${slug}`)
    },

    getChapter: (bookSlug: string, chapterSlug: string) => {
      return publicFetch<Chapter>(`${langPrefix}/books/${bookSlug}/chapters/${chapterSlug}`)
    },

    search: (q: string, params?: { limit?: number; offset?: number; highlight?: boolean }) => {
      return publicFetch<{ total: number; items: SearchResult[] }>(
        `${langPrefix}/search${buildQuery({ q, limit: params?.limit, offset: params?.offset, highlight: params?.highlight || undefined })}`
      )
    },

    suggest: (q: string, params?: { limit?: number }) => {
      return publicFetch<Suggestion[]>(
        `${langPrefix}/search/suggest${buildQuery({ q, limit: params?.limit })}`
      )
    },

    getAuthors: (params?: { limit?: number; offset?: number; sort?: 'name' | 'recent'; search?: string }) => {
      return publicFetch<{ total: number; items: Author[] }>(
        `/authors${buildQuery({ language, limit: params?.limit, offset: params?.offset, sort: params?.sort, search: params?.search })}`
      )
    },

    getAuthor: (slug: string) => {
      return publicFetch<AuthorDetail>(`/authors/${slug}`)
    },

    getGenres: () => {
      return publicFetch<{ total: number; items: Genre[] }>(`/genres${buildQuery({ language })}`)
    },

    getGenre: (slug: string) => {
      return publicFetch<GenreDetail>(`/genres/${slug}`)
    },
  }
}
