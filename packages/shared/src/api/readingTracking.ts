import { authFetch } from './client'
import type { ReadingStatsDto, DailyStatDto, AchievementDto, GoalDto } from '../types/api'

export function submitSession(data: {
  editionId?: string
  userBookId?: string
  durationSeconds: number
  wordsRead: number
  startPercent: number
  endPercent: number
}) {
  return authFetch<void>('/me/reading/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getStats() {
  return authFetch<ReadingStatsDto>('/me/reading/stats')
}

export function getDailyStats(params?: { year?: number }) {
  const qs = params?.year ? `?year=${params.year}` : ''
  return authFetch<DailyStatDto[]>(`/me/reading/stats/daily${qs}`)
}

export function getAchievements() {
  return authFetch<AchievementDto[]>('/me/reading/achievements')
}

export function getGoals() {
  return authFetch<GoalDto[]>('/me/reading/goals')
}

export function createGoal(data: { type: string; target: number }) {
  return authFetch<GoalDto>('/me/reading/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteGoal(id: string) {
  return authFetch<void>(`/me/reading/goals/${id}`, { method: 'DELETE' })
}
