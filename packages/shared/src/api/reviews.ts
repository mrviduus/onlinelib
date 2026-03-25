import { authFetch, publicFetch, buildQuery, jsonBody } from './client'

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
  const path = `/books/${editionId}/reviews${buildQuery({ sort: params?.sort, rating: params?.rating, limit: params?.limit, offset: params?.offset })}`
  try {
    return await authFetch<ReviewListResponse>(path)
  } catch {
    return publicFetch<ReviewListResponse>(path)
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
  return authFetch<PublicReviewDto>(`/me/ratings/${editionId}`, jsonBody('PUT', data))
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
  return publicFetch<CommentListResponse>(
    `/books/${editionId}/reviews/${reviewId}/comments${buildQuery({ limit: params?.limit, offset: params?.offset })}`)
}

export async function addReviewComment(
  reviewId: string,
  text: string
): Promise<ReviewCommentDto> {
  return authFetch<ReviewCommentDto>(`/me/reviews/${reviewId}/comments`, jsonBody('POST', { text }))
}

export async function deleteReviewComment(commentId: string): Promise<void> {
  await authFetch<void>(`/me/reviews/comments/${commentId}`, { method: 'DELETE' })
}

// User book ratings
export async function getUserBookRating(userBookId: string): Promise<UserRatingDto | null> {
  try {
    return await authFetch<UserRatingDto>(`/me/ratings/userbook/${userBookId}`)
  } catch {
    return null
  }
}

export async function upsertUserBookRating(userBookId: string, data: { rating: number }): Promise<UserRatingDto> {
  return authFetch<UserRatingDto>(`/me/ratings/userbook/${userBookId}`, jsonBody('PUT', data))
}

export async function deleteUserBookRating(userBookId: string): Promise<void> {
  await authFetch<void>(`/me/ratings/userbook/${userBookId}`, { method: 'DELETE' })
}
