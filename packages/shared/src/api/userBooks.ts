import { authFetch } from './client'
import type { UserBookDto, UserBookChapterDto, BookmarkDto } from '../types/api'

export function getUserBooks() {
  return authFetch<UserBookDto[]>('/me/books')
}

export function getUserBook(id: string) {
  return authFetch<UserBookDto>(`/me/books/${id}`)
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
  return authFetch<{ progress: number; chapterSlug: string | null }>(`/me/books/${bookId}/progress`)
}

export function updateUserBookProgress(bookId: string, data: { progress: number; chapterSlug: string }) {
  return authFetch<void>(`/me/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getUserBookBookmarks(bookId: string) {
  return authFetch<BookmarkDto[]>(`/me/books/${bookId}/bookmarks`)
}

export function getStorageQuota() {
  return authFetch<{ usedBytes: number; limitBytes: number }>('/me/books/quota')
}
