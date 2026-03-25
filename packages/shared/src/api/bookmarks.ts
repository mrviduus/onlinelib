import { authFetch, jsonBody } from './client'
import type { BookmarkDto } from '../types/api'

export function getBookmarks(editionId: string) {
  return authFetch<BookmarkDto[]>(`/me/bookmarks/${editionId}`)
}

export function createBookmark(data: { editionId: string; chapterId: string; locator: string; title: string }) {
  return authFetch<BookmarkDto>('/me/bookmarks', jsonBody('POST', data))
}

export function deleteBookmark(id: string) {
  return authFetch<void>(`/me/bookmarks/${id}`, { method: 'DELETE' })
}
