import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

vi.mock('../../../api/userBooks', () => ({
  getUserTags: async () => [
    { tag: 'fantasy', count: 3 },
    { tag: 'fiction', count: 2 },
    { tag: 'classic', count: 1 },
  ],
}))

import { TagInput, normalizeTag } from '../TagInput'

afterEach(() => cleanup())

describe('normalizeTag', () => {
  it('lowercases, trims, hyphenates spaces, strips invalid', () => {
    expect(normalizeTag(' My Favorites ')).toBe('my-favorites')
    expect(normalizeTag('Sci-Fi!@#')).toBe('sci-fi')
    expect(normalizeTag('  ')).toBe('')
    expect(normalizeTag('foo bar baz')).toBe('foo-bar-baz')
  })
})

describe('TagInput', () => {
  it('Enter adds normalized tag', async () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} />)
    const input = screen.getByLabelText('library.tags.add')
    fireEvent.change(input, { target: { value: 'My Tag' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['my-tag'])
  })

  it('Backspace on empty input removes last tag', () => {
    const onChange = vi.fn()
    render(<TagInput value={['fantasy', 'classic']} onChange={onChange} />)
    const input = screen.getByLabelText('library.tags.add')
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith(['fantasy'])
  })

  it('shows autocomplete suggestions filtered by input', async () => {
    render(<TagInput value={[]} onChange={() => {}} />)
    const input = screen.getByLabelText('library.tags.add')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fa' } })
    await waitFor(() => expect(screen.getByText('#fantasy')).toBeInTheDocument())
  })

  it('does not allow duplicate tags', () => {
    const onChange = vi.fn()
    render(<TagInput value={['fantasy']} onChange={onChange} />)
    const input = screen.getByLabelText('library.tags.add')
    fireEvent.change(input, { target: { value: 'fantasy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
