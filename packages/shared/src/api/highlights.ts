import { authFetch } from './client'

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
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.bookType) qs.set('bookType', params.bookType)
  if (params?.sort) qs.set('sort', params.sort)
  if (params?.search) qs.set('search', params.search)
  if (params?.color) qs.set('color', params.color)
  const query = qs.toString()
  return authFetch<HighlightListResponse>(`/me/highlights/all${query ? `?${query}` : ''}`)
}

export async function getHighlightsForReview(limit = 10): Promise<HighlightReviewItem[]> {
  return authFetch<HighlightReviewItem[]>(`/me/highlights/review?limit=${limit}`)
}

export async function markHighlightReviewed(highlightId: string): Promise<void> {
  await authFetch<void>('/me/highlights/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ highlightId }),
  })
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
}): Promise<PublicHighlight> {
  return authFetch<PublicHighlight>('/me/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateHighlight(
  id: string,
  data: {
    color?: string
    anchorJson?: string
    selectedText?: string
    noteText?: string | null
    version?: number
  }
): Promise<PublicHighlight> {
  return authFetch<PublicHighlight>(`/me/highlights/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteHighlight(id: string): Promise<void> {
  await authFetch<void>(`/me/highlights/${id}`, { method: 'DELETE' })
}
