import { describe, it, expect } from 'vitest'
import { formatTimeAgo } from './timeAgo'

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0)
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()

describe('formatTimeAgo', () => {
  it('never says a negative number of minutes', () => {
    // The defect. Math.floor on a negative difference rounds away from zero, so
    // one millisecond of clock skew into the future rendered "−1m ago" — which
    // QA saw immediately after a progress write.
    expect(formatTimeAgo(at(-1), NOW)).toBe('just now')
    expect(formatTimeAgo(at(-90_000), NOW)).toBe('just now')
  })

  it('says "just now" instead of "0m ago"', () => {
    expect(formatTimeAgo(at(0), NOW)).toBe('just now')
    expect(formatTimeAgo(at(59_000), NOW)).toBe('just now')
  })

  it('counts minutes, hours and days', () => {
    expect(formatTimeAgo(at(60_000), NOW)).toBe('1m ago')
    expect(formatTimeAgo(at(59 * 60_000), NOW)).toBe('59m ago')
    expect(formatTimeAgo(at(60 * 60_000), NOW)).toBe('1h ago')
    expect(formatTimeAgo(at(25 * 3600_000), NOW)).toBe('1d ago')
  })

  it('renders nothing for a missing or unparseable timestamp', () => {
    // A row with no recorded activity should show no phrase, not "NaNm ago".
    expect(formatTimeAgo(null, NOW)).toBe('')
    expect(formatTimeAgo(undefined, NOW)).toBe('')
    expect(formatTimeAgo('not a date', NOW)).toBe('')
  })
})
