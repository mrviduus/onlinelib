import { authFetch, publicFetch } from './client'

export interface MoodDto {
  id: string
  slug: string
  name: string
  emoji: string | null
}

export async function getAllMoods(): Promise<MoodDto[]> {
  return publicFetch<MoodDto[]>('/moods')
}

export async function getMoodsForEdition(editionId: string): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/${editionId}`)
}

export async function setMoodsForEdition(editionId: string, moodIds: string[]): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/${editionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moodIds }),
  })
}

export async function getMoodsForUserBook(userBookId: string): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/userbook/${userBookId}`)
}

export async function setMoodsForUserBook(userBookId: string, moodIds: string[]): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/userbook/${userBookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moodIds }),
  })
}
