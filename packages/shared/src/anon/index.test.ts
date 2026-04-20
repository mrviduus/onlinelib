import { describe, it, expect } from 'vitest'
import { getAnonymousReaderName, getAnonymousReaderColor, getAnonymousReaderAvatarPath, getAnonymousReaderAnimal, getAnonymousReader } from './index'

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
    expect(getAnonymousReaderName('eda2099c0e4f44738f69782d2a2d1bb5')).toBe('Bright Koala')
  })
})

describe('getAnonymousReaderAvatarPath', () => {
  it('same seed returns same path', () => {
    const a = getAnonymousReaderAvatarPath('abc-123')
    const b = getAnonymousReaderAvatarPath('abc-123')
    expect(a).toBe(b)
  })

  it('output matches /avatars/anon/<animal>.png', () => {
    const re = /^\/avatars\/anon\/[a-z]+\.png$/
    for (let i = 0; i < 30; i++) {
      expect(getAnonymousReaderAvatarPath(`seed-${i}`)).toMatch(re)
    }
  })

  it('animal in path matches animal in name', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `seed-${i}`
      const name = getAnonymousReaderName(seed)
      const path = getAnonymousReaderAvatarPath(seed)!
      const animalFromName = name.split(' ')[1].toLowerCase()
      expect(path).toBe(`/avatars/anon/${animalFromName}.png`)
    }
  })

  it('null / undefined / empty → null', () => {
    expect(getAnonymousReaderAvatarPath(null)).toBeNull()
    expect(getAnonymousReaderAvatarPath(undefined)).toBeNull()
    expect(getAnonymousReaderAvatarPath('')).toBeNull()
  })
})

describe('getAnonymousReader (compound)', () => {
  it('matches scalar helpers for same seed', () => {
    const seed = 'abc-123'
    const r = getAnonymousReader(seed)
    expect(r.name).toBe(getAnonymousReaderName(seed))
    expect(r.color).toBe(getAnonymousReaderColor(seed))
    expect(r.animal).toBe(getAnonymousReaderAnimal(seed))
    expect(r.avatarPath).toBe(getAnonymousReaderAvatarPath(seed))
  })

  it('null seed → fallback name + null animal/avatarPath', () => {
    const r = getAnonymousReader(null)
    expect(r.name).toBe('Quiet Owl')
    expect(r.animal).toBeNull()
    expect(r.avatarPath).toBeNull()
    expect(r.color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('getAnonymousReaderAnimal', () => {
  it('returns lowercase animal matching name', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `seed-${i}`
      expect(getAnonymousReaderAnimal(seed)).toBe(getAnonymousReaderName(seed).split(' ')[1].toLowerCase())
    }
  })

  it('null / undefined / empty → null', () => {
    expect(getAnonymousReaderAnimal(null)).toBeNull()
    expect(getAnonymousReaderAnimal(undefined)).toBeNull()
    expect(getAnonymousReaderAnimal('')).toBeNull()
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
