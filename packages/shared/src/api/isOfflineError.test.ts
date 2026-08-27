import { describe, it, expect } from 'vitest'
import { ApiError, isOfflineError } from './client'

describe('isOfflineError', () => {
  it('is true for a request that never reached the server', () => {
    const e = new ApiError(0, 'Network request failed')
    e.isNetworkError = true
    expect(isOfflineError(e)).toBe(true)
  })

  it('is false for a server that answered badly', () => {
    // 500 means the request arrived. Showing "you're offline" here would send
    // the reader to check their wifi while the backend is the thing on fire.
    expect(isOfflineError(new ApiError(500, 'Internal Server Error'))).toBe(false)
    expect(isOfflineError(new ApiError(404, 'Not Found'))).toBe(false)
  })

  it('is false for anything that is not an ApiError', () => {
    expect(isOfflineError(new TypeError('boom'))).toBe(false)
    expect(isOfflineError('offline')).toBe(false)
    expect(isOfflineError(null)).toBe(false)
    expect(isOfflineError(undefined)).toBe(false)
  })
})
