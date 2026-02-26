import { authFetch } from './client'
import type { UserLibraryItem } from '../types/api'

export function getLibrary() {
  return authFetch<UserLibraryItem[]>('/me/library')
}

export function addToLibrary(editionId: string) {
  return authFetch<void>(`/me/library/${editionId}`, { method: 'POST' })
}

export function removeFromLibrary(editionId: string) {
  return authFetch<void>(`/me/library/${editionId}`, { method: 'DELETE' })
}
