import { describe, it, expect } from 'vitest'
import { isTokenExpiring, readTokenExpiryMs, TOKEN_EXPIRY_SKEW_MS } from './tokenExpiry'

const NOW = 1_700_000_000_000

function seg(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}

function jwt(payload: Record<string, unknown>): string {
  return [seg({ alg: 'HS256', typ: 'JWT' }), seg(payload), 'sig'].join('.')
}

/** `exp` is in SECONDS in a JWT — the off-by-1000 here is the classic bug. */
function jwtExpiringAt(ms: number): string {
  return jwt({ sub: 'u1', is_guest: true, exp: Math.floor(ms / 1000) })
}

describe('readTokenExpiryMs', () => {
  it('reads exp and converts seconds to milliseconds', () => {
    expect(readTokenExpiryMs(jwt({ exp: 1_700_000_123 }))).toBe(1_700_000_123_000)
  })

  it('returns null for null/empty/non-JWT input', () => {
    expect(readTokenExpiryMs(null)).toBeNull()
    expect(readTokenExpiryMs(undefined)).toBeNull()
    expect(readTokenExpiryMs('')).toBeNull()
    expect(readTokenExpiryMs('opaque-token')).toBeNull()
    expect(readTokenExpiryMs('only.two')).toBeNull()
  })

  it('returns null when the payload has no exp, or a non-numeric one', () => {
    expect(readTokenExpiryMs(jwt({ sub: 'u1' }))).toBeNull()
    expect(readTokenExpiryMs(jwt({ exp: 'soon' }))).toBeNull()
  })

  it('returns null for a payload that is not base64/JSON at all', () => {
    expect(readTokenExpiryMs('a.!!!!.c')).toBeNull()
  })

  it('survives non-ASCII claims, which atob hands back as latin1 mojibake', () => {
    // A real user's name or email can be non-ASCII. `atob` decodes bytes, not
    // UTF-8, so `JSON.parse` can reject the result — `exp` is still ASCII
    // digits and must survive that.
    expect(readTokenExpiryMs(jwt({ name: 'Вася Вдовиченко 日本', exp: 1_700_000_123 })))
      .toBe(1_700_000_123_000)
  })
})

describe('isTokenExpiring', () => {
  it('is true for a token that expired an hour ago', () => {
    expect(isTokenExpiring(jwtExpiringAt(NOW - 3_600_000), NOW)).toBe(true)
  })

  it('is false for a token with 59 minutes left — a fresh 60-minute token', () => {
    expect(isTokenExpiring(jwtExpiringAt(NOW + 59 * 60_000), NOW)).toBe(false)
  })

  it('is true inside the skew window, so a token cannot die mid-flight', () => {
    expect(isTokenExpiring(jwtExpiringAt(NOW + TOKEN_EXPIRY_SKEW_MS - 1_000), NOW)).toBe(true)
  })

  it('is false just outside the skew window', () => {
    expect(isTokenExpiring(jwtExpiringAt(NOW + TOKEN_EXPIRY_SKEW_MS + 1_000), NOW)).toBe(false)
  })

  it('is false when the expiry cannot be read — the conservative direction', () => {
    // Guessing "expired" would refresh, and a refresh that fails offline
    // returns null, which drops a bearer that may have been perfectly valid.
    expect(isTokenExpiring('not-a-jwt', NOW)).toBe(false)
    expect(isTokenExpiring(null, NOW)).toBe(false)
    expect(isTokenExpiring(jwt({ sub: 'u1' }), NOW)).toBe(false)
  })

  it('honours a caller-supplied skew', () => {
    const t = jwtExpiringAt(NOW + 120_000)
    expect(isTokenExpiring(t, NOW, 60_000)).toBe(false)
    expect(isTokenExpiring(t, NOW, 300_000)).toBe(true)
  })
})
