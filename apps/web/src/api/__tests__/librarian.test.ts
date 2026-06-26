import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  askLibrarian,
  isValidLibrarianQuery,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
} from '../librarian'

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  })
}

const SAMPLE = {
  recommendations: [
    {
      source: 'library',
      editionId: 'e1',
      slug: 'nineteen-eighty-four',
      title: '1984',
      authors: ['George Orwell'],
      why: 'Surveillance dystopia, ~328 pages.',
      year: 1949,
      pages: 328,
    },
    {
      source: 'open_library',
      slug: null,
      title: 'We',
      authors: ['Yevgeny Zamyatin'],
      why: 'The proto-1984 surveillance state.',
    },
  ],
  reasoning: 'You want surveillance dystopias under 300 pages.',
  usedExternal: true,
  runId: 'r1',
}

describe('librarian api', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('askLibrarian POSTs the query and returns the parsed response', async () => {
    const fetchMock = mockOk(SAMPLE)
    vi.stubGlobal('fetch', fetchMock)

    const res = await askLibrarian('books like 1984 about surveillance')

    expect(res.recommendations).toHaveLength(2)
    expect(res.usedExternal).toBe(true)
    expect(res.runId).toBe('r1')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/me/librarian')
    expect(opts.method).toBe('POST')
    expect(opts.credentials).toBe('include')
    expect(JSON.parse(opts.body)).toEqual({ query: 'books like 1984 about surveillance' })
  })

  it('rejects on a non-ok response, surfacing the server error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Query must be at least 2 characters.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(askLibrarian('a')).rejects.toThrow('Query must be at least 2 characters.')
  })
})

describe('isValidLibrarianQuery (mirrors backend guard)', () => {
  it('rejects blank / whitespace-only', () => {
    expect(isValidLibrarianQuery('')).toBe(false)
    expect(isValidLibrarianQuery('   ')).toBe(false)
  })

  it('rejects a single trimmed char (no usable intent)', () => {
    expect(isValidLibrarianQuery('a')).toBe(false)
    expect(isValidLibrarianQuery(' a ')).toBe(false)
  })

  it('accepts at the min length', () => {
    expect('ab'.length).toBe(MIN_QUERY_LENGTH)
    expect(isValidLibrarianQuery('ab')).toBe(true)
  })

  it('rejects beyond the max length', () => {
    expect(isValidLibrarianQuery('a'.repeat(MAX_QUERY_LENGTH))).toBe(true)
    expect(isValidLibrarianQuery('a'.repeat(MAX_QUERY_LENGTH + 1))).toBe(false)
  })
})
