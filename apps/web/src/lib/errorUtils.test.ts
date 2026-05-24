import { describe, it, expect } from 'vitest'
import { isNotFoundError } from './errorUtils'
import { HttpError } from './fetchWithRetry'

describe('isNotFoundError', () => {
  it('returns true for HttpError(404)', () => {
    expect(isNotFoundError(new HttpError(404, 'Not Found'))).toBe(true)
  })

  it('returns false for HttpError with other status', () => {
    expect(isNotFoundError(new HttpError(500, 'Server Error'))).toBe(false)
    expect(isNotFoundError(new HttpError(401, 'Unauthorized'))).toBe(false)
    expect(isNotFoundError(new HttpError(403, 'Forbidden'))).toBe(false)
    expect(isNotFoundError(new HttpError(400, 'Bad Request'))).toBe(false)
  })

  it('returns false for plain Error', () => {
    expect(isNotFoundError(new Error('any'))).toBe(false)
  })

  it('returns false for TypeError', () => {
    expect(isNotFoundError(new TypeError('network'))).toBe(false)
  })

  it('returns false for non-Error values (defensive boundary)', () => {
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
    expect(isNotFoundError('string')).toBe(false)
    expect(isNotFoundError(404)).toBe(false)
    expect(isNotFoundError({ status: 404 })).toBe(false) // duck-typed obj is NOT HttpError
  })
})
