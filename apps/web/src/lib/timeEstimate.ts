export const FALLBACK_PACE_WPM = 200

export interface BookForEstimate {
  totalWordCount: number | null
  progressPercent: number | null
}

export function estimateMinutesRemaining(book: BookForEstimate, paceWpm: number): number | null {
  const total = book.totalWordCount
  if (!total || total <= 0) return null
  if (!paceWpm || paceWpm <= 0) return null
  const percent = Math.min(1, Math.max(0, book.progressPercent ?? 0))
  const remainingWords = total * (1 - percent)
  if (remainingWords <= 0) return 0
  return Math.round(remainingWords / paceWpm)
}

export function formatTimeLeft(minutes: number): string {
  if (minutes <= 0) return '0m'
  if (minutes >= 50 * 60) return `~${Math.round(minutes / 60)}h`
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  return `~${minutes}m`
}
