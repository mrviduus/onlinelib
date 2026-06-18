import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string) => (k === 'stats.concepts.more' ? '+{count} more' : k),
    language: 'en',
  }),
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

const { getConcepts } = vi.hoisted(() => ({ getConcepts: vi.fn() }))
vi.mock('../../../api/vocabulary', () => ({ getConcepts }))

import { ConceptsSection } from '../ConceptsSection'

afterEach(() => {
  cleanup()
  getConcepts.mockReset()
})

describe('ConceptsSection', () => {
  it('renders concept cards from getConcepts', async () => {
    getConcepts.mockResolvedValue([
      { id: '1', title: 'Seafaring', theme: 'Nautical', memberCount: 3, cohesionScore: 0.8, words: ['mast', 'helm', 'keel'] },
    ])
    render(<ConceptsSection />)

    expect(await screen.findByText('Seafaring')).toBeTruthy()
    expect(screen.getByText('Nautical')).toBeTruthy()
    expect(screen.getByText(/mast, helm, keel/)).toBeTruthy()
    expect(screen.queryByText('stats.concepts.empty')).toBeNull()
  })

  it('shows "+N more" when memberCount exceeds shown words', async () => {
    getConcepts.mockResolvedValue([
      { id: '1', title: 'Seafaring', theme: null, memberCount: 6, cohesionScore: 0.8, words: ['mast', 'helm', 'keel', 'bow'] },
    ])
    render(<ConceptsSection />)

    // 'more' template has {count} replaced with 2 (6 - 4)
    expect(
      await screen.findByText(
        (_, el) => el?.className === 'concept-card__more' && el.textContent?.trim() === '+2 more',
      ),
    ).toBeTruthy()
  })

  it('renders the empty state on []', async () => {
    getConcepts.mockResolvedValue([])
    render(<ConceptsSection />)

    expect(await screen.findByText('stats.concepts.empty')).toBeTruthy()
  })

  it('renders the empty state on fetch error', async () => {
    getConcepts.mockRejectedValue(new Error('boom'))
    render(<ConceptsSection />)

    await waitFor(() => expect(screen.getByText('stats.concepts.empty')).toBeTruthy())
  })
})
