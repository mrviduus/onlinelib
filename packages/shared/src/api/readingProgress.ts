import { authFetch, jsonBody } from './client'
import type { ReadingProgressDto } from '../types/api'

export function getProgress(editionId: string) {
  return authFetch<ReadingProgressDto>(`/me/progress/${editionId}`)
}

/**
 * Save a catalog-book reading position.
 *
 * `progress` is BOOK-wide (0..1) — the canonical unit of
 * `ReadingProgress.Percent`. It used to be a chapter fraction from this client
 * and a book fraction from web, into the same column.
 *
 * `scrollOffset` is what makes a cross-device resume land in the right place.
 * This client used to send `{"type":"chapter","slug":…}` and drop the offset
 * entirely, so opening the book on another device resumed at the top of the
 * chapter no matter how far in you were. The `scroll:` form is what every other
 * writer already uses, and `parseScrollLocator` reads it back.
 */
export function updateProgress(
  editionId: string,
  data: { chapterId: string; chapterSlug: string; progress: number; scrollOffset?: number },
) {
  const offset = typeof data.scrollOffset === 'number' && Number.isFinite(data.scrollOffset) && data.scrollOffset > 0
    ? Math.floor(data.scrollOffset)
    : 0
  return authFetch<void>(`/me/progress/${editionId}`, jsonBody('PUT', {
    chapterId: data.chapterId,
    locator: `scroll:${data.chapterSlug}:${offset}`,
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
