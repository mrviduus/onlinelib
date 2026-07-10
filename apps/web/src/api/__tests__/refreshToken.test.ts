import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { refreshToken } from '../auth'

// Regression: the reader fires many authenticated requests in parallel, so an
// expired access token 401s them all at once. The server rotates the refresh
// token on every /auth/refresh, so concurrent refreshes race — only the first
// wins, the rest present a deleted token and fail → spurious "Unauthorized".
// refreshToken() must single-flight: N concurrent callers → ONE /auth/refresh.
describe('refreshToken single-flight', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('dedupes concurrent calls into a single /auth/refresh request', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    const gate = new Promise((r) => { resolveFetch = r })
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate
      return { ok: true, status: 200, text: async () => JSON.stringify({ user: { id: 'u1', email: 'a@b.c' } }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    // Fire 5 concurrent refreshes while the fetch is still pending.
    const calls = [refreshToken(), refreshToken(), refreshToken(), refreshToken(), refreshToken()]
    resolveFetch(null)
    const results = await Promise.all(calls)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/auth/refresh')
    expect(opts.method).toBe('POST')
    expect(opts.credentials).toBe('include')
    for (const r of results) expect(r.user.id).toBe('u1')
  })

  it('starts a fresh request after the in-flight one settles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ user: { id: 'u1', email: 'a@b.c' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await refreshToken()
    await refreshToken()

    // Sequential (not concurrent) calls each hit the network — the single-flight
    // window is only open while a refresh is actually in flight.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight lock on failure so a later refresh can retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'expired' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ user: { id: 'u1', email: 'a@b.c' } }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshToken()).rejects.toBeDefined()
    // A failed refresh must not wedge the lock — the next attempt fires anew.
    await expect(refreshToken()).resolves.toMatchObject({ user: { id: 'u1' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
