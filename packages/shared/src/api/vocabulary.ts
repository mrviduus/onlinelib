import { authFetch, buildQuery, jsonBody } from './client'
import type { VocabularyWordDto, VocabularyStatsDto, ReviewCardDto, SubmitReviewResponse } from '../types/api'

export function getWords(params?: { filter?: string; stage?: string; sort?: string; search?: string; limit?: number; offset?: number }) {
  // Backend uses 'stage' param (comma-separated stage numbers: 0,1,2,3,4)
  const stageValue = params?.stage || params?.filter
  return authFetch<{ total: number; items: VocabularyWordDto[] }>(
    `/me/vocabulary/words${buildQuery({ stage: stageValue, sort: params?.sort, search: params?.search, limit: params?.limit, offset: params?.offset })}`
  )
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
  return authFetch<VocabularyWordDto>('/me/vocabulary/words', jsonBody('POST', data))
}

export function updateWord(id: string, data: { translation?: string; definition?: string }) {
  return authFetch<VocabularyWordDto>(`/me/vocabulary/words/${id}`, jsonBody('PATCH', data))
}

export function deleteWord(id: string) {
  return authFetch<void>(`/me/vocabulary/words/${id}`, { method: 'DELETE' })
}

export function getReviewQueue(limit?: number, mode?: 'srs' | 'practice') {
  return authFetch<{ cards: ReviewCardDto[]; totalDue: number }>(
    `/me/vocabulary/review${buildQuery({ limit, mode: mode !== 'srs' ? mode : undefined })}`
  )
}

export function submitReview(data: { wordId: string; isCorrect: boolean; responseTimeMs: number; reviewMode?: string; mode?: string; selfAssessment?: string }) {
  return authFetch<SubmitReviewResponse>('/me/vocabulary/review', jsonBody('POST', data))
}

export function getVocabularyStats() {
  return authFetch<VocabularyStatsDto>('/me/vocabulary/stats')
}

export function getReaderVocab() {
  return authFetch<{ id: string; word: string; stage: number }[]>('/me/vocabulary/words/reader')
}

export function markAsKnown(id: string) {
  return authFetch<VocabularyWordDto>(`/me/vocabulary/words/${id}/known`, { method: 'PUT' })
}
