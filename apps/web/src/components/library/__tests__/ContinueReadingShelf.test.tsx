import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const useContinueReadingListMock = vi.fn()

vi.mock('../../../hooks/useContinueReadingList', () => ({
  useContinueReadingList: (limit?: number) => useContinueReadingListMock(limit),
}))
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ getLocalizedPath: (p: string) => `/en${p}` }),
}))
vi.mock('../../../api/client', () => ({
  getStorageUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null),
}))
vi.mock('../../../api/userBooks', () => ({
  getUserBookCoverUrl: (p: string | null) => (p ? `https://cdn.test/ub/${p}` : null),
}))

import { ContinueReadingShelf } from '../ContinueReadingShelf'

const editionItem = (slug: string, title: string, percent = 0.4) => ({
  kind: 'edition' as const,
  updatedAt: '2026-04-25T10:00:00Z',
  percent,
  item: { editionId: `e-${slug}`, slug, title, language: 'en', coverPath: 'cover.jpg', createdAt: '' },
  progress: { editionId: `e-${slug}`, chapterId: 'c1', chapterSlug: 'ch-1', locator: '{}', percent, updatedAt: '2026-04-25T10:00:00Z' },
})

const userBookItem = (id: string, title: string, percent = 0.6) => ({
  kind: 'userbook' as const,
  updatedAt: '2026-04-24T10:00:00Z',
  percent,
  book: {
    id, title, author: 'Author X', status: 'Ready',
    progressPercent: percent, progressUpdatedAt: '2026-04-24T10:00:00Z',
    progressChapterSlug: 'ch-2', coverPath: null,
  },
})

function renderShelf() {
  return render(
    <MemoryRouter>
      <ContinueReadingShelf />
    </MemoryRouter>,
  )
}

describe('ContinueReadingShelf', () => {
  beforeEach(() => useContinueReadingListMock.mockReset())
  afterEach(() => cleanup())

  it('renders nothing while loading', () => {
    useContinueReadingListMock.mockReturnValue({ items: [], loading: true })
    const { container } = renderShelf()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when empty', () => {
    useContinueReadingListMock.mockReturnValue({ items: [], loading: false })
    const { container } = renderShelf()
    expect(container.firstChild).toBeNull()
  })

  it('renders cards for items', () => {
    useContinueReadingListMock.mockReturnValue({
      items: [editionItem('book-a', 'Book A', 0.42), userBookItem('u1', 'My Upload', 0.7)],
      loading: false,
    })
    renderShelf()
    expect(screen.getByText('Book A')).toBeInTheDocument()
    expect(screen.getByText('My Upload')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('marks first item with Continue badge', () => {
    useContinueReadingListMock.mockReturnValue({
      items: [editionItem('book-a', 'Book A'), editionItem('book-b', 'Book B')],
      loading: false,
    })
    renderShelf()
    const badges = screen.getAllByText('library.continueShelf.badge')
    expect(badges).toHaveLength(1)
  })

  it('builds correct resume URL for edition', () => {
    useContinueReadingListMock.mockReturnValue({
      items: [editionItem('book-a', 'Book A')],
      loading: false,
    })
    renderShelf()
    const link = screen.getByRole('link', { name: /Book A/ })
    expect(link.getAttribute('href')).toBe('/en/books/book-a/ch-1')
  })

  it('builds correct resume URL for userbook', () => {
    useContinueReadingListMock.mockReturnValue({
      items: [userBookItem('u-42', 'My Upload')],
      loading: false,
    })
    renderShelf()
    const link = screen.getByRole('link', { name: /My Upload/ })
    expect(link.getAttribute('href')).toBe('/en/library/my/u-42/read/ch-2')
  })

  it('passes limit=5 to hook', () => {
    useContinueReadingListMock.mockReturnValue({ items: [], loading: false })
    renderShelf()
    expect(useContinueReadingListMock).toHaveBeenCalledWith(5)
  })
})
