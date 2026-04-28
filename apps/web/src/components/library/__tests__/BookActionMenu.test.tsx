import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))
vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}))

const markComplete = vi.fn(async (_id: string) => {})
const unmarkComplete = vi.fn(async (_id: string) => {})
const del = vi.fn(async (_id: string) => {})
const retry = vi.fn(async (_id: string) => {})
const cancel = vi.fn(async (_id: string) => {})

vi.mock('../../../api/userBooks', () => ({
  markUserBookComplete: (id: string) => markComplete(id),
  unmarkUserBookComplete: (id: string) => unmarkComplete(id),
  deleteUserBook: (id: string) => del(id),
  retryUserBook: (id: string) => retry(id),
  cancelUserBook: (id: string) => cancel(id),
}))

import { BookActionMenu } from '../BookActionMenu'
import type { LibraryItem } from '../../../api/auth'
import type { UserBook } from '../../../api/userBooks'

afterEach(() => { cleanup(); markComplete.mockClear(); unmarkComplete.mockClear(); del.mockClear(); retry.mockClear(); cancel.mockClear() })

const wrap = (node: React.ReactElement) =>
  render(<MemoryRouter>{node}</MemoryRouter>)

const savedItem: LibraryItem = {
  editionId: 'e1', slug: 's', title: 'Saved Book', language: 'en',
  coverPath: null,
} as LibraryItem

const ub = (overrides: Partial<UserBook> = {}): UserBook => ({
  id: 'u1', title: 'Upload', slug: 'u', language: 'en', author: null, description: null,
  coverPath: null, genre: null, status: 'Ready', errorMessage: null, chapterCount: 1,
  totalWordCount: 100, createdAt: '', completedAt: null, progressPercent: 0,
  progressUpdatedAt: null, progressChapterSlug: null, ...overrides,
})

describe('BookActionMenu (saved)', () => {
  it('shows View / Mark finished / Remove', () => {
    wrap(<BookActionMenu type="saved" book={savedItem} isFinished={false}
      onMarkFinished={() => {}} onMarkUnfinished={() => {}} onRemove={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.viewDetails')).toBeInTheDocument()
    expect(screen.getByText('library.actions.markFinished')).toBeInTheDocument()
    expect(screen.getByText('library.actions.removeFromLibrary')).toBeInTheDocument()
  })

  it('toggles label when finished', () => {
    wrap(<BookActionMenu type="saved" book={savedItem} isFinished={true}
      onMarkFinished={() => {}} onMarkUnfinished={() => {}} onRemove={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.markUnfinished')).toBeInTheDocument()
  })

  it('Remove opens confirm modal then fires onRemove', () => {
    const onRemove = vi.fn()
    wrap(<BookActionMenu type="saved" book={savedItem} isFinished={false}
      onMarkFinished={() => {}} onMarkUnfinished={() => {}} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    fireEvent.click(screen.getByText('library.actions.removeFromLibrary'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('library.actions.confirmDeleteConfirm'))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})

describe('BookActionMenu (userbook)', () => {
  it('Ready book shows view / mark / edit / delete', () => {
    wrap(<BookActionMenu type="userbook" book={ub()} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.viewDetails')).toBeInTheDocument()
    expect(screen.getByText('library.actions.markFinished')).toBeInTheDocument()
    expect(screen.getByText('library.actions.editMetadata')).toBeInTheDocument()
    expect(screen.getByText('library.actions.delete')).toBeInTheDocument()
  })

  it('Failed book shows Re-process, no Mark finished', () => {
    wrap(<BookActionMenu type="userbook" book={ub({ status: 'Failed' })} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.retry')).toBeInTheDocument()
    expect(screen.queryByText('library.actions.markFinished')).toBeNull()
    expect(screen.queryByText('library.actions.viewDetails')).toBeNull()
  })

  it('Processing book shows Cancel, no Mark/Edit', () => {
    wrap(<BookActionMenu type="userbook" book={ub({ status: 'Processing' })} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.cancel')).toBeInTheDocument()
    expect(screen.queryByText('library.actions.editMetadata')).toBeNull()
  })

  it('finished userbook toggles label to "Mark unfinished"', () => {
    wrap(<BookActionMenu type="userbook" book={ub({ completedAt: '2026-01-01' })} onChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('library.actions.menu'))
    expect(screen.getByText('library.actions.markUnfinished')).toBeInTheDocument()
  })
})
