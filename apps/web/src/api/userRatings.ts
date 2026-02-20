import { authFetch } from './client'

export interface UserRatingDto {
  editionId: string
  rating: number
  reviewText: string | null
  updatedAt: string
}

export interface UpsertRatingRequest {
  rating: number
  reviewText?: string | null
}

export async function getRating(editionId: string): Promise<UserRatingDto | null> {
  try {
    return await authFetch<UserRatingDto>(`/me/ratings/${editionId}`)
  } catch (e: any) {
    if (e.message?.includes('404') || e.message?.includes('Not Found')) return null
    throw e
  }
}

export async function getAllRatings(): Promise<UserRatingDto[]> {
  return authFetch<UserRatingDto[]>('/me/ratings')
}

export async function upsertRating(editionId: string, data: UpsertRatingRequest): Promise<UserRatingDto> {
  return authFetch<UserRatingDto>(`/me/ratings/${editionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteRating(editionId: string): Promise<void> {
  await authFetch<void>(`/me/ratings/${editionId}`, { method: 'DELETE' })
}
