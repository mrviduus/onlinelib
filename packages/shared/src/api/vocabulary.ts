import { authFetch } from './client'
import type { VocabularyWordDto, VocabularyStatsDto, ReviewCardDto, SubmitReviewResponse } from '../types/api'

export function getWords(params?: { filter?: string; stage?: string; sort?: string; search?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams()
  // Backend uses 'stage' param (comma-separated stage numbers: 0,1,2,3,4)
  const stageValue = params?.stage || params?.filter
  if (stageValue) query.set('stage', stageValue)
  if (params?.sort) query.set('sort', params.sort)
  if (params?.search) query.set('search', params.search)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.offset) query.set('offset', String(params.offset))
  const qs = query.toString()
  return authFetch<{ total: number; items: VocabularyWordDto[] }>(`/me/vocabulary/words${qs ? `?${qs}` : ''}`)
}

export function saveWord(data: {
  word: string
  translation?: string | null
  definition?: string | null
  sentence?: string | null
  bookTitle?: string | null
  language?: string | null
  editionId?: string | null
  chapterId?: string | null
  userBookId?: string | null
}) {
  return authFetch<VocabularyWordDto>('/me/vocabulary/words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateWord(id: string, data: { translation?: string; definition?: string }) {
  return authFetch<VocabularyWordDto>(`/me/vocabulary/words/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteWord(id: string) {
  return authFetch<void>(`/me/vocabulary/words/${id}`, { method: 'DELETE' })
}

export function getReviewQueue(limit?: number, mode?: 'srs' | 'practice') {
  const params = new URLSearchParams()
  if (limit) params.set('limit', String(limit))
  if (mode && mode !== 'srs') params.set('mode', mode)
  const qs = params.toString()
  return authFetch<{ cards: ReviewCardDto[]; totalDue: number }>(`/me/vocabulary/review${qs ? `?${qs}` : ''}`)
}

export function submitReview(data: { wordId: string; isCorrect: boolean; responseTimeMs: number; reviewMode: string }) {
  return authFetch<SubmitReviewResponse>('/me/vocabulary/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getVocabularyStats() {
  return authFetch<VocabularyStatsDto>('/me/vocabulary/stats')
}
