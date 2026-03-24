import { authFetch, publicFetch } from './client'

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

export async function getAllRatings(): Promise<UserRatingDto[]> {
  return authFetch<UserRatingDto[]>('/me/ratings')
}

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
  try {
    return await authFetch<ReviewListResponse>(
      `/books/${editionId}/reviews${query ? `?${query}` : ''}`)
  } catch {
    return publicFetch<ReviewListResponse>(
      `/books/${editionId}/reviews${query ? `?${query}` : ''}`)
  }
}

export async function getBookReviewStats(editionId: string): Promise<ReviewStatsDto> {
  return publicFetch<ReviewStatsDto>(`/books/${editionId}/reviews/stats`)
}

export async function submitReview(editionId: string, data: {
  rating: number
  title?: string
  reviewText?: string
  isSpoiler?: boolean
}): Promise<PublicReviewDto> {
  return authFetch<PublicReviewDto>(`/me/ratings/${editionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteReview(editionId: string): Promise<void> {
  await authFetch<void>(`/me/ratings/${editionId}`, { method: 'DELETE' })
}

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
  return publicFetch<CommentListResponse>(
    `/books/${editionId}/reviews/${reviewId}/comments${query ? `?${query}` : ''}`)
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
