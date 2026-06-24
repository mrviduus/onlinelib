import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LibrarianResults } from '../LibrarianResults'
import type { LibrarianResponse } from '../../../api/librarian'

// LocalizedLink → useLanguage().getLocalizedPath. Prefix with /en so the catalog link is assertable.
vi.mock('../../../context/LanguageContext', () => ({
  useLanguage: () => ({ getLocalizedPath: (p: string) => `/en${p}` }),
}))

// Minimal t: echoes interpolation so labels/notes assert cleanly without pulling the real i18n map.
const t = (key: string, vars?: Record<string, string | number>) => {
  if (vars) return `${key}:${Object.values(vars).join(',')}`
  return key
}

function renderResults(response: LibrarianResponse) {
  return render(<MemoryRouter><LibrarianResults response={response} t={t} /></MemoryRouter>)
}

const LIBRARY_REC = {
  source: 'library' as const,
  editionId: 'e1',
  slug: 'nineteen-eighty-four',
  title: '1984',
  authors: ['George Orwell'],
  why: 'Surveillance dystopia.',
  year: 1949,
  pages: 328,
}

const EXTERNAL_REC = {
  source: 'open_library' as const,
  slug: null,
  title: 'We',
  authors: ['Yevgeny Zamyatin'],
  why: 'The proto-1984.',
}

describe('LibrarianResults', () => {
  it('renders the reasoning and usedExternal note', () => {
    renderResults({ recommendations: [LIBRARY_REC], reasoning: 'Here is why', usedExternal: true, runId: 'r' })
    expect(screen.getByText('Here is why')).toBeInTheDocument()
    expect(screen.getByText('librarian.usedExternalNote')).toBeInTheDocument()
  })

  it('omits the usedExternal note when false', () => {
    renderResults({ recommendations: [LIBRARY_REC], reasoning: 'r', usedExternal: false, runId: 'r' })
    expect(screen.queryByText('librarian.usedExternalNote')).not.toBeInTheDocument()
  })

  it('library recommendation links to the localized book page', () => {
    renderResults({ recommendations: [LIBRARY_REC], reasoning: 'r', usedExternal: false, runId: 'r' })
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/en/books/nineteen-eighty-four')
    expect(link).toHaveAttribute('title', 'librarian.openBook:1984')
    expect(within(link).getByText('1984')).toBeInTheDocument()
  })

  it('external suggestion is NOT a link and is clearly marked', () => {
    renderResults({ recommendations: [EXTERNAL_REC], reasoning: 'r', usedExternal: true, runId: 'r' })
    // No anchor at all for an external suggestion — it doesn't exist in the catalog.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('librarian.suggestionBadge')).toBeInTheDocument()
    expect(screen.getByText('librarian.suggestionNote')).toBeInTheDocument()
  })

  it('renders both treatments together in order', () => {
    renderResults({ recommendations: [LIBRARY_REC, EXTERNAL_REC], reasoning: 'r', usedExternal: true, runId: 'r' })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1) // only the library item is linkable
    expect(links[0]).toHaveAttribute('href', '/en/books/nineteen-eighty-four')
    expect(screen.getByText('We')).toBeInTheDocument()
  })
})
