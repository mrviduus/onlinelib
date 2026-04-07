import { authFetch } from './client'

// --- Types ---

export interface VocabWordDto {
  id: string
  word: string
  language: string
  translation: string | null
  definition: string | null
  editionId: string | null
  chapterId: string | null
  userBookId: string | null
  sentence: string | null
  bookTitle: string | null
  hint: string | null
  stage: number
  intervalDays: number
  consecutiveCorrect: number
  nextReviewAt: string
  lastReviewedAt: string | null
  totalReviews: number
  correctReviews: number
  createdAt: string
  updatedAt: string
}

export interface SaveWordRequest {
  word: string
  language: string
  translation?: string | null
  definition?: string | null
  editionId?: string | null
  chapterId?: string | null
  userBookId?: string | null
  sentence?: string | null
  bookTitle?: string | null
  nativeLanguage?: string | null
}

export interface UpdateWordRequest {
  translation?: string | null
  definition?: string | null
}

export interface ReviewCardDto {
  wordId: string
  word: string
  translation: string | null
  definition: string | null
  reviewMode: 'multiple_choice' | 'context'
  blankSentence: string | null
  originalSentence: string | null
  bookTitle: string | null
  hint: string | null
  explanation: string | null
  isNew: boolean
  options: string[] | null
  correctOptionIndex: number | null
}

export interface ReviewQueueResponse {
  cards: ReviewCardDto[]
  totalDue: number
}

export type SelfAssessment = 'forgot' | 'almost' | 'knew'

export interface SubmitReviewRequest {
  wordId: string
  isCorrect: boolean
  responseTimeMs: number
  selfAssessment?: SelfAssessment
}

export interface SubmitReviewResponse {
  wordId: string
  previousStage: number
  newStage: number
  stageChanged: boolean
  nextIntervalDays: number
  nextReviewAt: string
  totalReviews: number
  correctReviews: number
}

export interface VocabStatsDto {
  totalWords: number
  byStage: {
    new: number
    recognition: number
    recall: number
    context: number
    mastered: number
  }
  dueNow: number
  reviewedToday: number
  correctRateToday: number
  srsReviewedToday: number
  srsCorrectRateToday: number
  practicedToday: number
  practiceCorrectRateToday: number
  totalReviews: number
  overallCorrectRate: number
  streak: number
  wordsByBook: { editionId: string | null; userBookId: string | null; bookTitle: string; count: number }[]
}

// --- API Functions ---

export async function saveWord(data: SaveWordRequest): Promise<VocabWordDto> {
  return authFetch<VocabWordDto>('/me/vocabulary/words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function getWords(params?: {
  stage?: string
  language?: string
  editionId?: string
  search?: string
  sort?: string
  reviewedSince?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; items: VocabWordDto[] }> {
  const query = new URLSearchParams()
  if (params?.stage) query.set('stage', params.stage)
  if (params?.language) query.set('language', params.language)
  if (params?.editionId) query.set('editionId', params.editionId)
  if (params?.search) query.set('search', params.search)
  if (params?.sort) query.set('sort', params.sort)
  if (params?.reviewedSince) query.set('reviewedSince', params.reviewedSince)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.offset) query.set('offset', String(params.offset))
  const qs = query.toString()
  return authFetch<{ total: number; items: VocabWordDto[] }>(`/me/vocabulary/words${qs ? `?${qs}` : ''}`)
}

export async function deleteWord(id: string): Promise<void> {
  await authFetch<void>(`/me/vocabulary/words/${id}`, { method: 'DELETE' })
}

export async function deleteAllWords(): Promise<{ deleted: number }> {
  return authFetch<{ deleted: number }>('/me/vocabulary/words', { method: 'DELETE' })
}

export async function updateWord(id: string, data: UpdateWordRequest): Promise<VocabWordDto> {
  return authFetch<VocabWordDto>(`/me/vocabulary/words/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function getReviewQueue(limit?: number): Promise<ReviewQueueResponse> {
  const params = new URLSearchParams()
  if (limit) params.set('limit', String(limit))
  const qs = params.toString()
  return authFetch<ReviewQueueResponse>(`/me/vocabulary/review${qs ? `?${qs}` : ''}`)
}

export async function submitReview(data: SubmitReviewRequest): Promise<SubmitReviewResponse> {
  return authFetch<SubmitReviewResponse>('/me/vocabulary/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function getVocabStats(): Promise<VocabStatsDto> {
  return authFetch<VocabStatsDto>('/me/vocabulary/stats')
}

export interface VocabDailyStatDto {
  date: string
  wordsAdded: number
  reviewCount: number
  correctCount: number
  practiceCount: number
  srsCount: number
}

export async function getVocabDailyStats(tz?: number): Promise<VocabDailyStatDto[]> {
  const params = new URLSearchParams()
  if (tz != null) params.set('tz', String(tz))
  const qs = params.toString()
  return authFetch<VocabDailyStatDto[]>(`/me/vocabulary/stats/daily${qs ? `?${qs}` : ''}`)
}

// --- Reader vocab (lightweight) ---

export interface ReaderVocabWordDto {
  id: string
  word: string
  stage: number
  translation?: string
}

export async function getReaderVocab(): Promise<ReaderVocabWordDto[]> {
  return authFetch<ReaderVocabWordDto[]>('/me/vocabulary/words/reader')
}

export async function markAsKnown(id: string): Promise<VocabWordDto> {
  return authFetch<VocabWordDto>(`/me/vocabulary/words/${id}/known`, { method: 'PUT' })
}
