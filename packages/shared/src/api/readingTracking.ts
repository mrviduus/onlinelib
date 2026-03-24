import { authFetch } from './client'
import type { ReadingStatsDto, DailyStatDto, AchievementDto, GoalDto } from '../types/api'

export function submitSession(data: {
  editionId?: string
  userBookId?: string
  durationSeconds: number
  wordsRead: number
  startPercent: number
  endPercent: number
  startedAt?: string
  endedAt?: string
}) {
  // Backend requires startedAt/endedAt — compute from duration if not provided
  const now = new Date()
  const payload = {
    ...data,
    startedAt: data.startedAt || new Date(now.getTime() - data.durationSeconds * 1000).toISOString(),
    endedAt: data.endedAt || now.toISOString(),
  }
  return authFetch<{ sessionId: string; newAchievements: string[] }>('/me/reading/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function getStats(tz?: number) {
  const params = new URLSearchParams()
  if (tz != null) params.set('tz', String(tz))
  const qs = params.toString()
  return authFetch<ReadingStatsDto>(`/me/reading/stats${qs ? `?${qs}` : ''}`)
}

export function getDailyStats(params?: { from?: string; to?: string; tz?: number; year?: number }) {
  const query = new URLSearchParams()
  if (params?.from) query.set('from', params.from)
  if (params?.to) query.set('to', params.to)
  if (params?.tz != null) query.set('tz', String(params.tz))
  // Legacy: year param → convert to from/to range
  if (params?.year && !params.from) {
    query.set('from', `${params.year}-01-01T00:00:00Z`)
    query.set('to', `${params.year}-12-31T23:59:59Z`)
  }
  const qs = query.toString()
  return authFetch<DailyStatDto[]>(`/me/reading/stats/daily${qs ? `?${qs}` : ''}`)
}

export function getAchievements() {
  return authFetch<AchievementDto[]>('/me/reading/achievements')
}

export function getGoals() {
  return authFetch<GoalDto[]>('/me/reading/goals')
}

export function createGoal(data: { type: string; target: number; year?: number; streakMinMinutes?: number }) {
  return authFetch<GoalDto>('/me/reading/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goalType: data.type,
      targetValue: data.target,
      year: data.year || new Date().getFullYear(),
      streakMinMinutes: data.streakMinMinutes,
    }),
  })
}

export function deleteGoal(id: string) {
  return authFetch<void>(`/me/reading/goals/${id}`, { method: 'DELETE' })
}

// Book stats types
export interface GenreStatDto { name: string; slug: string; count: number }
export interface AuthorStatDto { name: string; slug: string; count: number }
export interface LanguageStatDto { language: string; count: number }
export interface BooksOverTimeDto { period: string; books: number; pages: number }
export interface BookLengthBucketDto { bucket: string; count: number }
export interface MoodStatDto { name: string; emoji: string | null; count: number }
export interface RatingBucketDto { rating: number; count: number }
export interface PaceStatDto { pace: string; count: number }
export interface ReadingTimeStatDto { name: string; slug: string; seconds: number }

export interface BookStatsResponse {
  booksFinished: number
  totalPages: number
  avgDaysToFinish: number
  genreStats: GenreStatDto[]
  authorStats: AuthorStatDto[]
  languageStats: LanguageStatDto[]
  booksOverTime: BooksOverTimeDto[]
  bookLengthDistribution: BookLengthBucketDto[]
  moodStats: MoodStatDto[]
  ratingDistribution: RatingBucketDto[]
  avgRating: number | null
  paceStats: PaceStatDto[]
  readingTimeByGenre: ReadingTimeStatDto[]
  readingTimeByAuthor: ReadingTimeStatDto[]
  availableYears: number[]
}

export function getBookStats(year?: number) {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  const qs = params.toString()
  return authFetch<BookStatsResponse>(`/me/reading/book-stats${qs ? `?${qs}` : ''}`)
}
