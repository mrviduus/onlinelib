import { describe, it, expect } from 'vitest'
import { shelfItemRoute, resumeRoute } from './bookRoutes'
import type { ContinueReadingPick, LibraryShelfItem } from '@textstack/shared'

const shelfItem = (o: Partial<LibraryShelfItem> = {}): LibraryShelfItem => ({
  id: 'ub-1',
  type: 'userbook',
  title: 'A Book',
  author: null,
  coverPath: null,
  slug: null,
  language: 'en',
  progressPercent: 0.2,
  lastOpenedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  estimatedMinutesRemaining: null,
  ...o,
})

describe('shelfItemRoute', () => {
  it('sends a catalog item to the singular detail route', () => {
    // `/books/{slug}` has no matching file — `app/books.tsx` is the plural list.
    // Both copies of this function had it wrong, so every catalog item in every
    // shelf dead-ended in +not-found.
    expect(shelfItemRoute(shelfItem({ type: 'savedbook', slug: 'dracula' }))).toBe('/book/dracula')
  })

  it('sends a user book to its detail route', () => {
    expect(shelfItemRoute(shelfItem({ type: 'userbook', id: 'ub-9' }))).toBe('/my-books/ub-9')
  })

  it('does not invent a slug when the payload has none', () => {
    expect(shelfItemRoute(shelfItem({ type: 'savedbook', slug: null }))).toBe('/book/')
  })
})

describe('resumeRoute', () => {
  const edition = (o: Partial<Extract<ContinueReadingPick, { type: 'edition' }>> = {}) => ({
    type: 'edition' as const,
    slug: 'dracula',
    title: 'Dracula',
    coverPath: null,
    percent: 0.4,
    chapterSlug: 'chapter-4',
    updatedAtMs: 1,
    ...o,
  })
  const userbook = (o: Partial<Extract<ContinueReadingPick, { type: 'userbook' }>> = {}) => ({
    type: 'userbook' as const,
    id: 'ub-1',
    title: 'DDIA',
    coverPath: null,
    percent: 0.6,
    chapterSlug: 'chapter-5',
    updatedAtMs: 2,
    ...o,
  })

  it('opens the reader at the saved chapter', () => {
    expect(resumeRoute(edition())).toBe('/reader/dracula/chapter-4')
  })

  it('keeps the user-book segments in route order: bookId then chapterSlug', () => {
    // These were once swapped, so expo-router could not match the path and
    // silently fell back to the detail screen — Continue Reading looked broken
    // for every uploaded book.
    expect(resumeRoute(userbook())).toBe('/my-books/read/ub-1/chapter-5')
  })

  it('falls back to the detail screen when there is no chapter to resume', () => {
    expect(resumeRoute(edition({ chapterSlug: null }))).toBe('/book/dracula')
    expect(resumeRoute(userbook({ chapterSlug: null }))).toBe('/my-books/ub-1')
  })
})
