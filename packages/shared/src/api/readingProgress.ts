import { authFetch, jsonBody } from './client'
import type { ReadingProgressDto } from '../types/api'

export function getProgress(editionId: string) {
  return authFetch<ReadingProgressDto>(`/me/progress/${editionId}`)
}

export function updateProgress(editionId: string, data: { chapterId: string; chapterSlug: string; progress: number }) {
  return authFetch<void>(`/me/progress/${editionId}`, jsonBody('PUT', {
    chapterId: data.chapterId,
    locator: JSON.stringify({ type: 'chapter', slug: data.chapterSlug }),
    percent: data.progress,
    // Client timestamp for LWW merge on server (UserDataEndpoints.cs:134) and on restore in web.
    // Skips stale overwrites if a newer record already exists on the server.
    updatedAt: new Date().toISOString(),
  }))
}

export async function getAllProgress() {
  const res = await authFetch<{ total: number; items: ReadingProgressDto[] }>('/me/progress')
  return res.items
}
