import { describe, expect, it } from 'vitest'
import { estimateMinutesRemaining, formatTimeLeft, FALLBACK_PACE_WPM } from './timeEstimate'

describe('estimateMinutesRemaining', () => {
  it('100k words at 200 wpm with no progress → 500 min', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 100000, progressPercent: 0 }, 200)).toBe(500)
  })

  it('reduces by progress', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 10000, progressPercent: 0.5 }, 200)).toBe(25)
  })

  it('null wordCount → null', () => {
    expect(estimateMinutesRemaining({ totalWordCount: null, progressPercent: 0.1 }, 200)).toBeNull()
  })

  it('zero wordCount → null', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 0, progressPercent: 0 }, 200)).toBeNull()
  })

  it('zero pace → null', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 1000, progressPercent: 0 }, 0)).toBeNull()
  })

  it('progress >= 1 → 0', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 1000, progressPercent: 1 }, 200)).toBe(0)
    expect(estimateMinutesRemaining({ totalWordCount: 1000, progressPercent: 1.5 }, 200)).toBe(0)
  })

  it('null progress treated as 0', () => {
    expect(estimateMinutesRemaining({ totalWordCount: 4000, progressPercent: null }, FALLBACK_PACE_WPM)).toBe(20)
  })
})

describe('formatTimeLeft', () => {
  it('< 60m', () => { expect(formatTimeLeft(35)).toBe('~35m') })
  it('exactly 60m', () => { expect(formatTimeLeft(60)).toBe('1h') })
  it('h + m', () => { expect(formatTimeLeft(125)).toBe('2h 5m') })
  it('huge → no minutes', () => { expect(formatTimeLeft(3500)).toBe('~58h') })
  it('zero', () => { expect(formatTimeLeft(0)).toBe('0m') })
})
