import { describe, it, expect } from 'vitest'
import { formatTime } from './formatTime'

describe('formatTime', () => {
  it('0 seconds → "0m"', () => {
    expect(formatTime(0)).toBe('0m')
  })

  it('seconds under a minute → "0m"', () => {
    expect(formatTime(45)).toBe('0m')
  })

  it('exact minutes → "Nm"', () => {
    expect(formatTime(60)).toBe('1m')
    expect(formatTime(180)).toBe('3m')
  })

  it('minutes with leftover seconds → floors to minutes', () => {
    expect(formatTime(89)).toBe('1m') // 1m29s
    expect(formatTime(119)).toBe('1m')
    expect(formatTime(125)).toBe('2m')
  })

  it('exact hour → "1h 0m"', () => {
    expect(formatTime(3600)).toBe('1h 0m')
  })

  it('hours and minutes', () => {
    expect(formatTime(3660)).toBe('1h 1m')   // 1h 1m
    expect(formatTime(5400)).toBe('1h 30m')  // 1h 30m
    expect(formatTime(7200)).toBe('2h 0m')   // 2h
    expect(formatTime(7320)).toBe('2h 2m')   // 2h 2m
  })

  it('multi-hour readings', () => {
    expect(formatTime(3600 * 12)).toBe('12h 0m')
    expect(formatTime(3600 * 100)).toBe('100h 0m')
  })

  it('drops sub-minute seconds in hour mode', () => {
    expect(formatTime(3659)).toBe('1h 0m') // 1h 0m 59s → floors leftover seconds
  })
})
