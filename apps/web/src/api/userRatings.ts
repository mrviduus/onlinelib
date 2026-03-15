import { authFetch } from './client'

export interface UserRatingDto {
  id: string
  editionId: string | null
  userBookId: string | null
  rating: number
  reviewText: string | null
  title: string | null
  isSpoiler: boolean
  helpfulCount: number
  commentCount: number
  updatedAt: string
  editionTitle: string | null
  editionSlug: string | null
  editionCoverPath: string | null
  editionLanguage: string | null
  userBookTitle: string | null
}

export interface UpsertRatingRequest {
  rating: number
  reviewText?: string | null
  title?: string | null
  isSpoiler?: boolean
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

// User book ratings
export async function getUserBookRating(userBookId: string): Promise<UserRatingDto | null> {
  try {
    return await authFetch<UserRatingDto>(`/me/ratings/userbook/${userBookId}`)
  } catch (e: any) {
    if (e.message?.includes('404') || e.message?.includes('Not Found')) return null
    throw e
  }
}

export async function upsertUserBookRating(userBookId: string, data: UpsertRatingRequest): Promise<UserRatingDto> {
  return authFetch<UserRatingDto>(`/me/ratings/userbook/${userBookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteUserBookRating(userBookId: string): Promise<void> {
  await authFetch<void>(`/me/ratings/userbook/${userBookId}`, { method: 'DELETE' })
}
