import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

import { LibraryStatusTabs } from '../LibraryStatusTabs'
import type { LibraryStatus } from '../../../hooks/useLibraryStatus'

afterEach(() => cleanup())

const baseCounts: Record<LibraryStatus, number> = {
  all: 12, reading: 3, finished: 4, notStarted: 5, failed: 0,
}

describe('LibraryStatusTabs', () => {
  it('renders Reading / Finished / Not started / All; hides Failed when count=0', () => {
    render(<LibraryStatusTabs value="reading" onChange={() => {}} counts={baseCounts} />)
    expect(screen.getByText('library.status.reading')).toBeInTheDocument()
    expect(screen.getByText('library.status.finished')).toBeInTheDocument()
    expect(screen.getByText('library.status.notStarted')).toBeInTheDocument()
    expect(screen.getByText('library.status.all')).toBeInTheDocument()
    expect(screen.queryByText('library.status.failed')).toBeNull()
  })

  it('shows Failed tab when count > 0', () => {
    render(<LibraryStatusTabs value="reading" onChange={() => {}} counts={{ ...baseCounts, failed: 2 }} />)
    expect(screen.getByText('library.status.failed')).toBeInTheDocument()
  })

  it('marks active tab via aria-selected', () => {
    render(<LibraryStatusTabs value="finished" onChange={() => {}} counts={baseCounts} />)
    const tabs = screen.getAllByRole('tab')
    const finishedTab = tabs.find(t => t.textContent?.includes('finished'))!
    const readingTab = tabs.find(t => t.textContent?.includes('reading'))!
    expect(finishedTab).toHaveAttribute('aria-selected', 'true')
    expect(readingTab).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange with selected status', () => {
    const onChange = vi.fn()
    render(<LibraryStatusTabs value="reading" onChange={onChange} counts={baseCounts} />)
    fireEvent.click(screen.getByText('library.status.finished'))
    expect(onChange).toHaveBeenCalledWith('finished')
  })

  it('renders counts beside labels', () => {
    render(<LibraryStatusTabs value="reading" onChange={() => {}} counts={baseCounts} />)
    expect(screen.getByText('3')).toBeInTheDocument() // reading
    expect(screen.getByText('4')).toBeInTheDocument() // finished
    expect(screen.getByText('5')).toBeInTheDocument() // notStarted
    expect(screen.getByText('12')).toBeInTheDocument() // all
  })
})
