import { authFetch } from './client'
import { API_BASE } from './client'
import { fetchJsonWithRetry } from '../lib/fetchWithRetry'

export interface MoodDto {
  id: string
  slug: string
  name: string
  emoji: string | null
}

/** List all available moods (public, no auth needed) */
export async function getAllMoods(): Promise<MoodDto[]> {
  return fetchJsonWithRetry<MoodDto[]>(`${API_BASE}/moods`)
}

/** Get user's mood IDs for an edition */
export async function getMoodsForEdition(editionId: string): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/${editionId}`)
}

/** Set moods for an edition (replaces all) */
export async function setMoodsForEdition(editionId: string, moodIds: string[]): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/${editionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moodIds }),
  })
}
