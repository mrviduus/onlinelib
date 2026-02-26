import { authFetch } from './client'
import type { BookmarkDto } from '../types/api'

export function getBookmarks(editionId: string) {
  return authFetch<BookmarkDto[]>(`/me/bookmarks/${editionId}`)
}

export function createBookmark(data: { editionId: string; chapterId: string; locator: string; title: string }) {
  return authFetch<BookmarkDto>('/me/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteBookmark(id: string) {
  return authFetch<void>(`/me/bookmarks/${id}`, { method: 'DELETE' })
}
