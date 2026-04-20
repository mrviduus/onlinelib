import { describe, it, expect } from 'vitest'
import { getAnonymousReaderName } from './getAnonymousReaderName'

describe('getAnonymousReaderName', () => {
  it('same seed returns same pseudonym', () => {
    const a = getAnonymousReaderName('abc-123')
    const b = getAnonymousReaderName('abc-123')
    const c = getAnonymousReaderName('abc-123')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('different seeds produce variety', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `user-${i.toString(16)}-${Math.random()}`)
    const names = new Set(seeds.map(getAnonymousReaderName))
    expect(names.size).toBeGreaterThan(5)
  })

  it('null / undefined / empty string → "Quiet Owl"', () => {
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
