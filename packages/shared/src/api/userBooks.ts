import { authFetch, jsonBody } from './client'
import type { UserBookDto, UserBookChapterDto, BookmarkDto } from '../types/api'

export function getUserBooks() {
  return authFetch<UserBookDto[]>('/me/books')
}

export interface UserBookDetailResponse {
  id: string
  title: string
  slug: string
  language: string
  author: string | null
  description: string | null
  coverPath: string | null
  genre: string | null
  publishedYear: number | null
  totalWordCount: number | null
  status: string
  errorMessage: string | null
  chapters: { id: string; chapterNumber: number; slug: string | null; title: string; wordCount: number | null }[]
  toc: { title: string; chapterNumber: number | null; children: any[] | null }[] | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export function getUserBook(id: string) {
  return authFetch<UserBookDetailResponse>(`/me/books/${id}`)
}

export function getUserBookChapter(bookId: string, chapterSlug: string) {
  return authFetch<UserBookChapterDto>(`/me/books/${bookId}/chapters/${chapterSlug}`)
}

export function uploadUserBook(formData: FormData) {
  return authFetch<UserBookDto>('/me/books/upload', {
    method: 'POST',
    body: formData,
  })
}

export function deleteUserBook(id: string) {
  return authFetch<void>(`/me/books/${id}`, { method: 'DELETE' })
}

export function retryUserBook(id: string) {
  return authFetch<void>(`/me/books/${id}/retry`, { method: 'POST' })
}

export function getUserBookProgress(bookId: string) {
  return authFetch<{ chapterSlug: string | null; locator: string | null; percent: number | null; updatedAt: string | null }>(`/me/books/${bookId}/progress`)
}

export function updateUserBookProgress(bookId: string, data: { chapterSlug: string; locator?: string; percent?: number }) {
  return authFetch<void>(`/me/books/${bookId}/progress`, jsonBody('PUT', data))
}

export function getUserBookBookmarks(bookId: string) {
  return authFetch<BookmarkDto[]>(`/me/books/${bookId}/bookmarks`)
}

export function createUserBookBookmark(bookId: string, data: { chapterId: string; locator: string; title?: string }) {
  return authFetch<BookmarkDto>(`/me/books/${bookId}/bookmarks`, jsonBody('POST', data))
}

export function deleteUserBookBookmark(bookId: string, bookmarkId: string) {
  return authFetch<void>(`/me/books/${bookId}/bookmarks/${bookmarkId}`, { method: 'DELETE' })
}

export function getStorageQuota() {
  return authFetch<{ usedBytes: number; limitBytes: number }>('/me/books/quota')
}

export function markUserBookComplete(id: string) {
  return authFetch<void>(`/me/books/${id}/complete`, { method: 'POST' })
}

export function unmarkUserBookComplete(id: string) {
  return authFetch<void>(`/me/books/${id}/complete`, { method: 'DELETE' })
}

export function cancelUserBook(id: string) {
  return authFetch<void>(`/me/books/${id}/cancel`, { method: 'POST' })
}
