import { authFetch, buildQuery, jsonBody } from './client'

export interface PublicHighlight {
  id: string
  editionId: string | null
  chapterId: string | null
  userBookId: string | null
  userChapterId: string | null
  anchorJson: string
  color: string
  selectedText: string
  noteText: string | null
  version: number
  createdAt: string
  updatedAt: string
  isPublic: boolean
  likeCount: number
  publishedAt: string | null
}

export interface HighlightListItem {
  id: string
  selectedText: string
  color: string
  noteText: string | null
  createdAt: string
  editionId: string | null
  editionTitle: string | null
  editionSlug: string | null
  editionCoverPath: string | null
  userBookId: string | null
  userBookTitle: string | null
  userBookCoverPath: string | null
  chapterId: string | null
  userChapterId: string | null
  chapterTitle: string | null
  userChapterTitle: string | null
  chapterSlug: string | null
  userChapterSlug: string | null
  isPublic: boolean
  likeCount: number
}

export interface HotspotTopNote {
  highlightId: string
  noteText: string | null
  likeCount: number
  color: string
  userId: string
  likedByMe: boolean
}

export interface Hotspot {
  key: string
  anchorJson: string
  text: string
  count: number
  likeTotal: number
  topNotes: HotspotTopNote[]
}

export interface HighlightListResponse {
  items: HighlightListItem[]
  totalCount: number
}

export interface HighlightReviewItem {
  id: string
  selectedText: string
  color: string
  noteText: string | null
  bookTitle: string | null
  chapterTitle: string | null
  lastReviewedAt: string | null
}

export async function getHighlights(editionId: string): Promise<PublicHighlight[]> {
  return authFetch<PublicHighlight[]>(`/me/highlights/${editionId}`)
}

export async function getUserBookHighlights(userBookId: string): Promise<PublicHighlight[]> {
  return authFetch<PublicHighlight[]>(`/me/highlights/userbook/${userBookId}`)
}

export async function getAllHighlights(params?: {
  limit?: number
  offset?: number
  bookType?: 'all' | 'edition' | 'userbook'
  sort?: 'newest' | 'oldest'
  search?: string
  color?: string
}): Promise<HighlightListResponse> {
  return authFetch<HighlightListResponse>(
    `/me/highlights/all${buildQuery({ limit: params?.limit, offset: params?.offset, bookType: params?.bookType, sort: params?.sort, search: params?.search, color: params?.color })}`
  )
}

export async function getHighlightsForReview(limit = 10): Promise<HighlightReviewItem[]> {
  return authFetch<HighlightReviewItem[]>(`/me/highlights/review?limit=${limit}`)
}

export async function markHighlightReviewed(highlightId: string): Promise<void> {
  await authFetch<void>('/me/highlights/review', jsonBody('POST', { highlightId }))
}

export async function createHighlight(data: {
  editionId?: string
  chapterId?: string
  userBookId?: string
  userChapterId?: string
  anchorJson: string
  color: string
  selectedText: string
  noteText?: string
  isPublic?: boolean
}): Promise<PublicHighlight> {
  return authFetch<PublicHighlight>('/me/highlights', jsonBody('POST', data))
}

export async function updateHighlight(
  id: string,
  data: {
    color?: string
    anchorJson?: string
    selectedText?: string
    noteText?: string | null
    version?: number
    isPublic?: boolean
  }
): Promise<PublicHighlight> {
  return authFetch<PublicHighlight>(`/me/highlights/${id}`, jsonBody('PUT', data))
}

export async function deleteHighlight(id: string): Promise<void> {
  await authFetch<void>(`/me/highlights/${id}`, { method: 'DELETE' })
}

export async function getHotspots(editionId: string, chapterId: string): Promise<Hotspot[]> {
  try {
    return await authFetch<Hotspot[]>(`/books/${editionId}/chapters/${chapterId}/hotspots`)
  } catch {
    return []
  }
}

export async function publishHighlight(id: string, isPublic: boolean): Promise<void> {
  await authFetch<unknown>(`/me/highlights/${id}/publish`, jsonBody('POST', { isPublic }))
}

export async function likeHighlight(id: string): Promise<{ likeCount: number; liked: boolean }> {
  return authFetch<{ likeCount: number; liked: boolean }>(`/me/highlights/${id}/like`, { method: 'POST' })
}

export async function unlikeHighlight(id: string): Promise<{ likeCount: number; liked: boolean }> {
  return authFetch<{ likeCount: number; liked: boolean }>(`/me/highlights/${id}/like`, { method: 'DELETE' })
}

export async function reportHighlight(id: string, reason: string, note?: string): Promise<void> {
  await authFetch<unknown>(`/me/highlights/${id}/report`, jsonBody('POST', { reason, note }))
}
