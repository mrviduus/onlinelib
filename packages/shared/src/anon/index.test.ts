import { describe, it, expect } from 'vitest'
import { getAnonymousReaderName, getAnonymousReaderColor } from './index'

describe('getAnonymousReaderName', () => {
  it('same seed returns same pseudonym', () => {
    const a = getAnonymousReaderName('abc-123')
    const b = getAnonymousReaderName('abc-123')
    expect(a).toBe(b)
  })

  it('different seeds produce variety', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `user-${i.toString(16)}-${Math.random()}`)
    const names = new Set(seeds.map(getAnonymousReaderName))
    expect(names.size).toBeGreaterThan(5)
  })

  it('null / undefined / empty string → fallback', () => {
    expect(getAnonymousReaderName(null)).toBe('Quiet Owl')
    expect(getAnonymousReaderName(undefined)).toBe('Quiet Owl')
    expect(getAnonymousReaderName('')).toBe('Quiet Owl')
  })

  it('output always matches [Adjective] [Animal] pattern', () => {
    const re = /^[A-Z][a-z]+ [A-Z][a-z]+$/
    for (let i = 0; i < 50; i++) {
      const seed = `seed-${i}-${Math.random().toString(36)}`
      expect(getAnonymousReaderName(seed)).toMatch(re)
    }
  })

  it('fixture snapshot — guards against accidental hash/list drift', () => {
    expect(getAnonymousReaderName('eda2099c0e4f44738f69782d2a2d1bb5')).toBe('Bright Rabbit')
  })
})

describe('getAnonymousReaderColor', () => {
  it('same seed returns same color', () => {
    const a = getAnonymousReaderColor('abc-123')
    const b = getAnonymousReaderColor('abc-123')
    expect(a).toBe(b)
  })

  it('output is a hex color #rrggbb', () => {
    const re = /^#[0-9a-f]{6}$/i
    for (let i = 0; i < 30; i++) {
      expect(getAnonymousReaderColor(`seed-${i}`)).toMatch(re)
    }
  })

  it('null / undefined / empty → fallback hex', () => {
    const re = /^#[0-9a-f]{6}$/i
    expect(getAnonymousReaderColor(null)).toMatch(re)
    expect(getAnonymousReaderColor(undefined)).toMatch(re)
    expect(getAnonymousReaderColor('')).toMatch(re)
  })
})
