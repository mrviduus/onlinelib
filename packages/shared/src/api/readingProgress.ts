import { authFetch } from './client'
import type { ReadingProgressDto } from '../types/api'

export function getProgress(editionId: string) {
  return authFetch<ReadingProgressDto>(`/me/progress/${editionId}`)
}

export function updateProgress(editionId: string, data: { chapterId: string; chapterSlug: string; progress: number }) {
  return authFetch<void>(`/me/progress/${editionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getAllProgress() {
  return authFetch<ReadingProgressDto[]>('/me/progress')
}
