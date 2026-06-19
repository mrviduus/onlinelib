import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))
vi.mock('../../../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }))

const { askState } = vi.hoisted(() => ({
  askState: { history: [] as unknown[], isLoading: false, error: null as string | null, ask: vi.fn() },
}))
vi.mock('../../../hooks/useAsk', () => ({ useAsk: () => askState }))

const { ragState } = vi.hoisted(() => ({
  ragState: { status: 'Ready', chunkCount: 0, embeddedCount: 0, preparing: false, prepare: vi.fn() },
}))
vi.mock('../../../hooks/useRagIndex', () => ({ useRagIndex: () => ragState }))

import { AskPanel } from '../AskPanel'

const baseProps = {
  open: true,
  editionId: 'ed-1',
  onSignIn: vi.fn(),
  onNavigateToCitation: vi.fn(),
  onClose: vi.fn(),
}

afterEach(() => {
  cleanup()
  askState.history = []
  ragState.status = 'Ready'
  ragState.chunkCount = 0
  ragState.embeddedCount = 0
  ragState.prepare = vi.fn()
})

describe('AskPanel', () => {
  it('shows the sign-in CTA when unauthenticated', () => {
    render(<AskPanel {...baseProps} isAuthenticated={false} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('reader.ask.signInCta')).toBeTruthy()
    expect(screen.queryByPlaceholderText('reader.ask.placeholder')).toBeNull()
  })

  it('shows the composer when authenticated', () => {
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.getByPlaceholderText('reader.ask.placeholder')).toBeTruthy()
  })

  it('shows the prepare CTA when not indexed (not the read-enough message)', () => {
    ragState.status = 'NotIndexed'
    const prepare = vi.fn()
    ragState.prepare = prepare
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.queryByPlaceholderText('reader.ask.placeholder')).toBeNull()
    fireEvent.click(screen.getByText('reader.ask.prepareCta'))
    expect(prepare).toHaveBeenCalled()
  })

  it('shows progress while indexing with composer hidden', () => {
    ragState.status = 'Indexing'
    ragState.chunkCount = 4
    ragState.embeddedCount = 2
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByPlaceholderText('reader.ask.placeholder')).toBeNull()
  })

  it('shows retry on failure', () => {
    ragState.status = 'Failed'
    const prepare = vi.fn()
    ragState.prepare = prepare
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    fireEvent.click(screen.getByText('reader.ask.indexRetry'))
    expect(prepare).toHaveBeenCalled()
  })

  it('renders a citation chip and navigates on click', () => {
    const citation = { marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 4, charStart: 0, charEnd: 1, preview: 'snippet' }
    askState.history = [{ question: 'q', answer: 'a [1]', citations: [citation], insufficient: false }]
    const onNavigateToCitation = vi.fn()

    render(<AskPanel {...baseProps} isAuthenticated={true} onNavigateToCitation={onNavigateToCitation} />)
    const chip = screen.getByTitle('snippet')
    fireEvent.click(chip)

    expect(onNavigateToCitation).toHaveBeenCalledWith(citation)
  })
})
