import { authFetch, publicFetch, jsonBody } from './client'

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
  return authFetch<string[]>(`/me/moods/${editionId}`, jsonBody('PUT', { moodIds }))
}

export async function getMoodsForUserBook(userBookId: string): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/userbook/${userBookId}`)
}

export async function setMoodsForUserBook(userBookId: string, moodIds: string[]): Promise<string[]> {
  return authFetch<string[]>(`/me/moods/userbook/${userBookId}`, jsonBody('PUT', { moodIds }))
}
