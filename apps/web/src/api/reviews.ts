import { authFetch, API_BASE } from './client'
import { fetchJsonWithRetry } from '../lib/fetchWithRetry'

export interface PublicReviewDto {
  id: string
  userId: string
  userName: string | null
  userPicture: string | null
  rating: number
  title: string | null
  reviewText: string
  isSpoiler: boolean
  helpfulCount: number
  commentCount: number
  createdAt: string
  isLikedByMe: boolean
}

export interface ReviewListResponse {
  total: number
  items: PublicReviewDto[]
}

export interface ReviewStatsDto {
  avgRating: number
  totalRatings: number
  totalReviews: number
  distribution: {
    star5: number
    star4: number
    star3: number
    star2: number
    star1: number
  }
}

export interface ReviewCommentDto {
  id: string
  userId: string
  userName: string | null
  userPicture: string | null
  text: string
  createdAt: string
}

export interface CommentListResponse {
  total: number
  items: ReviewCommentDto[]
}

export interface LikeResponse {
  liked: boolean
  helpfulCount: number
}

// Public (no auth needed)
export async function getBookReviews(
  editionId: string,
  params?: { sort?: string; rating?: number; limit?: number; offset?: number }
): Promise<ReviewListResponse> {
  const qs = new URLSearchParams()
  if (params?.sort) qs.set('sort', params.sort)
  if (params?.rating) qs.set('rating', String(params.rating))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const query = qs.toString()
  // Use authFetch to pass credentials for isLikedByMe, but won't fail if not logged in
  try {
    return await authFetch<ReviewListResponse>(
      `/books/${editionId}/reviews${query ? `?${query}` : ''}`)
  } catch {
    return fetchJsonWithRetry<ReviewListResponse>(
      `${API_BASE}/books/${editionId}/reviews${query ? `?${query}` : ''}`)
  }
}

export async function getBookReviewStats(editionId: string): Promise<ReviewStatsDto> {
  return fetchJsonWithRetry<ReviewStatsDto>(`${API_BASE}/books/${editionId}/reviews/stats`)
}

// Authenticated
export async function likeReview(reviewId: string): Promise<LikeResponse> {
  return authFetch<LikeResponse>(`/me/reviews/${reviewId}/like`, { method: 'POST' })
}

export async function unlikeReview(reviewId: string): Promise<LikeResponse> {
  return authFetch<LikeResponse>(`/me/reviews/${reviewId}/like`, { method: 'DELETE' })
}

export async function getReviewComments(
  editionId: string,
  reviewId: string,
  params?: { limit?: number; offset?: number }
): Promise<CommentListResponse> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const query = qs.toString()
  return fetchJsonWithRetry<CommentListResponse>(
    `${API_BASE}/books/${editionId}/reviews/${reviewId}/comments${query ? `?${query}` : ''}`)
}

export async function addReviewComment(
  reviewId: string,
  text: string
): Promise<ReviewCommentDto> {
  return authFetch<ReviewCommentDto>(`/me/reviews/${reviewId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

export async function deleteReviewComment(commentId: string): Promise<void> {
  await authFetch<void>(`/me/reviews/comments/${commentId}`, { method: 'DELETE' })
}
