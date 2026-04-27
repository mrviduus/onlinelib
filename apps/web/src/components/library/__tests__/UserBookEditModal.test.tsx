import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

const updateMock = vi.fn(async (_id: string, _data: unknown) => ({}))

vi.mock('../../../api/userBooks', () => ({
  updateUserBookMetadata: (id: string, data: unknown) => updateMock(id, data),
}))

import { UserBookEditModal } from '../UserBookEditModal'
import type { UserBook } from '../../../api/userBooks'

afterEach(() => { cleanup(); updateMock.mockClear() })

const book: UserBook = {
  id: 'b1', title: 'My Book', slug: 'my-book', language: 'en', author: 'Author',
  description: 'Old desc', coverPath: null, genre: 'Fiction',
  status: 'Ready', errorMessage: null, chapterCount: 1, totalWordCount: 100,
  createdAt: '', completedAt: null, progressPercent: 0, progressUpdatedAt: null,
  progressChapterSlug: null,
}

describe('UserBookEditModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <UserBookEditModal open={false} book={book} onClose={() => {}} onSaved={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('prefills fields and saves trimmed values', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<UserBookEditModal open book={book} onClose={onClose} onSaved={onSaved} />)
    expect((screen.getByLabelText('library.editMetadata.fieldTitle') as HTMLInputElement).value).toBe('My Book')
    fireEvent.change(screen.getByLabelText('library.editMetadata.fieldTitle'), { target: { value: '  New Title  ' } })
    fireEvent.click(screen.getByText('library.editMetadata.save'))
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
    expect(updateMock.mock.calls[0][0]).toBe('b1')
    expect((updateMock.mock.calls[0][1] as { title: string }).title).toBe('New Title')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Save when title empty', () => {
    render(<UserBookEditModal open book={book} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('library.editMetadata.fieldTitle'), { target: { value: '   ' } })
    expect((screen.getByText('library.editMetadata.save') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('library.editMetadata.errorTitleRequired')).toBeInTheDocument()
  })

  it('Esc closes modal', () => {
    const onClose = vi.fn()
    render(<UserBookEditModal open book={book} onClose={onClose} onSaved={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
