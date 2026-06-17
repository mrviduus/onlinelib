import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { SimilarBook } from '../../../types/api'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

// LocalizedLink pulls in LanguageContext — stub it to a plain anchor.
vi.mock('../../LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const { getSimilarBooks } = vi.hoisted(() => ({ getSimilarBooks: vi.fn() }))
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ getSimilarBooks }) }))

import { SimilarBooksRail } from '../SimilarBooksRail'

const BOOKS: SimilarBook[] = [
  { slug: 'war-and-peace', title: 'War and Peace', language: 'en', coverPath: 'cover-a.jpg', score: 0.92 },
  { slug: 'anna-karenina', title: 'Anna Karenina', language: 'en', coverPath: null, score: 0.88 },
]

afterEach(() => {
  cleanup()
  getSimilarBooks.mockReset()
})

describe('SimilarBooksRail', () => {
  it('renders cards from getSimilarBooks', async () => {
    getSimilarBooks.mockResolvedValue(BOOKS)
    render(<SimilarBooksRail slug="dracula" />)

    await waitFor(() => expect(screen.getByText('War and Peace')).toBeTruthy())
    expect(screen.getByText('Anna Karenina')).toBeTruthy()
    expect(getSimilarBooks).toHaveBeenCalledWith('dracula')
    // null coverPath → letter fallback
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('renders nothing when the list is empty', async () => {
    getSimilarBooks.mockResolvedValue([])
    const { container } = render(<SimilarBooksRail slug="dracula" />)
    await waitFor(() => expect(getSimilarBooks).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
  })

  it('renders nothing when the fetch fails', async () => {
    getSimilarBooks.mockRejectedValue(new Error('boom'))
    const { container } = render(<SimilarBooksRail slug="dracula" />)
    await waitFor(() => expect(getSimilarBooks).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
  })
})
