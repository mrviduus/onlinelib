import { describe, it, expect } from 'vitest'
import { pathnamePrefix } from './pathPrefix'

describe('pathnamePrefix — degenerate inputs', () => {
  it('null → /', () => {
    expect(pathnamePrefix(null)).toBe('/')
  })

  it('undefined → /', () => {
    expect(pathnamePrefix(undefined)).toBe('/')
  })

  it('empty string → /', () => {
    expect(pathnamePrefix('')).toBe('/')
  })

  it('root → /', () => {
    expect(pathnamePrefix('/')).toBe('/')
  })

  it('just slashes → /', () => {
    expect(pathnamePrefix('///')).toBe('/')
  })
})

describe('pathnamePrefix — default 2-segment compression', () => {
  it('preserves first two segments', () => {
    expect(pathnamePrefix('/reader/dracula')).toBe('/reader/dracula')
  })

  it('drops everything after second segment', () => {
    expect(pathnamePrefix('/reader/dracula/chapter-1')).toBe('/reader/dracula')
  })

  it('handles tab routes', () => {
    expect(pathnamePrefix('/library')).toBe('/library')
  })

  it('handles single-segment routes', () => {
    expect(pathnamePrefix('/stats')).toBe('/stats')
  })
})

describe('pathnamePrefix — 3-segment special cases', () => {
  // The point of this whole module — PII-safe path that ALSO preserves
  // enough route info for "reader vs browse" analytics.
  it('/my-books/read/<id> keeps 3 segments', () => {
    expect(pathnamePrefix('/my-books/read/abc-123')).toBe('/my-books/read')
  })

  it('/my-books/read/<id>/<chapter> keeps 3 segments', () => {
    expect(pathnamePrefix('/my-books/read/abc-123/chapter-1')).toBe('/my-books/read')
  })

  it('/my-books/<id> (detail, not reader) stays at 2', () => {
    expect(pathnamePrefix('/my-books/abc-123')).toBe('/my-books/abc-123')
  })

  it('/my-books (list root) stays at 1', () => {
    expect(pathnamePrefix('/my-books')).toBe('/my-books')
  })
})

describe('pathnamePrefix — invariants', () => {
  it('never returns a path containing slugs that look like UUIDs', () => {
    // Empirical check — feed a few realistic deep paths.
    const paths = [
      '/reader/dracula-by-stoker/chapter-7',
      '/book/anna-karenina-russian',
      '/author/dostoyevsky',
      '/my-books/read/01234567-89ab-cdef-0123-456789abcdef/part-3',
    ]
    for (const p of paths) {
      const out = pathnamePrefix(p)
      // No UUID-shaped segment should slip through.
      expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
    }
  })

  it('output is always shorter or equal to input', () => {
    const paths = ['/', '/a', '/a/b', '/a/b/c', '/a/b/c/d/e', '/my-books/read/x/y/z']
    for (const p of paths) {
      const out = pathnamePrefix(p)
      expect(out.length).toBeLessThanOrEqual(p.length)
    }
  })
})
