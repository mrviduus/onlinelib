import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enrichUserBook } from '../userBooks'

describe('enrichUserBook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('POSTs /me/books/{id}/enrich with credentials and resolves on 202', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(enrichUserBook('abc-123')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/me/books/abc-123/enrich')
    expect(opts.method).toBe('POST')
    expect(opts.credentials).toBe('include')
  })

  it('rejects on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'not found' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(enrichUserBook('missing')).rejects.toThrow('not found')
  })
})
