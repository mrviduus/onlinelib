import { authFetch } from './client'
import type { VocabularyWordDto, VocabularyStatsDto, ReviewCardDto } from '../types/api'

export function getWords(params?: { filter?: string; sort?: string; search?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams()
  if (params?.filter) query.set('filter', params.filter)
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
}) {
  return authFetch<VocabularyWordDto>('/me/vocabulary/words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteWord(id: string) {
  return authFetch<void>(`/me/vocabulary/words/${id}`, { method: 'DELETE' })
}

export function getReviewQueue(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return authFetch<ReviewCardDto[]>(`/me/vocabulary/review${qs}`)
}

export function submitReview(data: { wordId: string; isCorrect: boolean; responseTimeMs: number; reviewMode: string }) {
  return authFetch<void>('/me/vocabulary/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getVocabularyStats() {
  return authFetch<VocabularyStatsDto>('/me/vocabulary/stats')
}
