import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Citation chips no longer go through i18n: their text is a chapter title, a page number or an
// ordinal, and the label is shared with mobile (packages/shared/src/reader/citation.ts) so both
// clients say the same thing. Every key here returns its bare key.
const CITATION_TEMPLATES: Record<string, string> = {}
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, params?: Record<string, unknown>) => {
      const template = CITATION_TEMPLATES[k] ?? k
      return params
        ? template.replace(/\{\{(\w+)\}\}/g, (_, p) => String(params[p]))
        : template
    },
    language: 'en',
  }),
}))
vi.mock('../../../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }))

const { chatState, useBookChatSpy } = vi.hoisted(() => ({
  chatState: {
    history: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    ask: vi.fn(),
    historyLoading: false,
    spoilerGateEnabled: false,
    setSpoilerGate: vi.fn(),
    clearChat: vi.fn(),
  },
  useBookChatSpy: vi.fn(),
}))
vi.mock('../../../hooks/useBookChat', () => ({
  useBookChat: (...args: unknown[]) => { useBookChatSpy(...args); return chatState },
}))

const { ragState, useRagIndexSpy } = vi.hoisted(() => ({
  ragState: { status: 'Ready', chunkCount: 0, embeddedCount: 0, preparing: false, prepare: vi.fn() },
  useRagIndexSpy: vi.fn(),
}))
vi.mock('../../../hooks/useRagIndex', () => ({
  useRagIndex: (...args: unknown[]) => { useRagIndexSpy(...args); return ragState },
}))

import { AskPanel } from '../AskPanel'
import type { AskTarget } from '../../../api/ask'

const editionTarget: AskTarget = { kind: 'edition', id: 'ed-1' }

const baseProps = {
  open: true,
  askTarget: editionTarget,
  onSignIn: vi.fn(),
  onNavigateToCitation: vi.fn(),
  onClose: vi.fn(),
}

afterEach(() => {
  cleanup()
  chatState.history = []
  chatState.ask = vi.fn()
  chatState.isLoading = false
  chatState.error = null
  chatState.historyLoading = false
  chatState.spoilerGateEnabled = false
  chatState.setSpoilerGate = vi.fn()
  chatState.clearChat = vi.fn()
  ragState.status = 'Ready'
  ragState.chunkCount = 0
  ragState.embeddedCount = 0
  ragState.prepare = vi.fn()
  useBookChatSpy.mockReset()
  useRagIndexSpy.mockReset()
  vi.restoreAllMocks()
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

  it('gates the chat load on open && isAuthenticated', () => {
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(useBookChatSpy).toHaveBeenCalledWith(editionTarget, undefined, true)
  })

  it('renders a loading skeleton while history loads', () => {
    chatState.historyLoading = true
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.getByLabelText('reader.ask.loadingHistory')).toBeTruthy()
    // Starters/empty hidden while loading.
    expect(screen.queryByText('reader.ask.startersTitle')).toBeNull()
  })

  it('renders persisted history turns on load', () => {
    chatState.history = [
      { question: 'q1', answer: 'a1', citations: [], insufficient: false, streaming: false },
      { question: 'q2', answer: 'a2', citations: [], insufficient: false, streaming: false },
    ]
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.getByText('q1')).toBeTruthy()
    expect(screen.getByText('a2')).toBeTruthy()
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

  it('threads a userbook askTarget through to both hooks', () => {
    const userTarget: AskTarget = { kind: 'userbook', id: 'ub-1', ragStatus: 'NotIndexed' }
    render(<AskPanel {...baseProps} askTarget={userTarget} isAuthenticated={true} />)
    expect(useRagIndexSpy).toHaveBeenCalledWith(userTarget)
    expect(useBookChatSpy).toHaveBeenCalledWith(userTarget, undefined, true)
  })

  it('renders a citation chip and navigates on click', () => {
    const citation = { marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 4, charStart: 0, charEnd: 1, preview: 'snippet' }
    chatState.history = [{ question: 'q', answer: 'a [1]', citations: [citation], insufficient: false, streaming: false }]
    const onNavigateToCitation = vi.fn()

    render(<AskPanel {...baseProps} isAuthenticated={true} onNavigateToCitation={onNavigateToCitation} />)
    const chip = screen.getByTitle('snippet')
    fireEvent.click(chip)

    expect(onNavigateToCitation).toHaveBeenCalledWith(citation)
  })

  // Was `p. 12`, from the i18n template. The label is now built by the shared helper, which writes
  // `p.12` — the form mobile already used — and prefixes the answer's marker so `[1]` in the text can
  // be matched to a chip. Rewritten rather than deleted: the behaviour it guards (a PDF citation is
  // labelled by page, tooltipped by sectionPath, and navigates on click) is unchanged.
  it('labels a PDF citation with its marker and page, and uses sectionPath as the tooltip', () => {
    const citation = {
      marker: 1, chunkId: 'c1', chapterId: null, chapterOrd: null,
      charStart: 0, charEnd: 1, preview: 'snippet',
      sourcePage: 12, sectionPath: 'Chapter 3 › Methods',
    }
    chatState.history = [{ question: 'q', answer: 'a [1]', citations: [citation], insufficient: false, streaming: false }]
    const onNavigateToCitation = vi.fn()

    render(<AskPanel {...baseProps} isAuthenticated={true} onNavigateToCitation={onNavigateToCitation} />)
    const chip = screen.getByText('[1] p.12')
    expect(chip.getAttribute('title')).toBe('Chapter 3 › Methods')
    fireEvent.click(chip)

    expect(onNavigateToCitation).toHaveBeenCalledWith(citation)
  })

  it('shows starter questions on an empty, Ready thread and submits one on click', () => {
    chatState.history = []
    ragState.status = 'Ready'
    const ask = vi.fn()
    chatState.ask = ask

    render(<AskPanel {...baseProps} isAuthenticated={true} />)

    expect(screen.getByText('reader.ask.startersTitle')).toBeTruthy()
    const starter = screen.getByText('reader.ask.starters.summary')
    fireEvent.click(starter)
    expect(ask).toHaveBeenCalledWith('reader.ask.starters.summary')
  })

  it('hides starters once the thread has a turn', () => {
    chatState.history = [{ question: 'q', answer: 'a', citations: [], insufficient: false, streaming: false }]
    ragState.status = 'Ready'
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.queryByText('reader.ask.startersTitle')).toBeNull()
  })

  it('does not show starters until the index is Ready', () => {
    chatState.history = []
    ragState.status = 'NotIndexed'
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.queryByText('reader.ask.startersTitle')).toBeNull()
  })

  it('toggles the spoiler gate (optimistic PATCH via the hook)', () => {
    const setSpoilerGate = vi.fn()
    chatState.setSpoilerGate = setSpoilerGate
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(setSpoilerGate).toHaveBeenCalledWith(true)
  })

  it('clears the chat after confirmation', () => {
    chatState.history = [{ question: 'q', answer: 'a', citations: [], insufficient: false, streaming: false }]
    const clearChat = vi.fn()
    chatState.clearChat = clearChat
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    fireEvent.click(screen.getByLabelText('reader.ask.clearChat'))
    expect(clearChat).toHaveBeenCalled()
  })

  it('does not clear when the confirm is dismissed', () => {
    chatState.history = [{ question: 'q', answer: 'a', citations: [], insufficient: false, streaming: false }]
    const clearChat = vi.fn()
    chatState.clearChat = clearChat
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    fireEvent.click(screen.getByLabelText('reader.ask.clearChat'))
    expect(clearChat).not.toHaveBeenCalled()
  })

  it('attaches a selection prefill as a quote card and sends it as a quoted question', () => {
    const ask = vi.fn()
    chatState.ask = ask
    const { rerender } = render(
      <AskPanel {...baseProps} isAuthenticated={true} prefill={null} />,
    )
    // Attach the passage.
    rerender(<AskPanel {...baseProps} isAuthenticated={true} prefill={{ text: 'the whale', nonce: 1 }} />)
    expect(screen.getByText('the whale')).toBeTruthy()

    // Type a question and send — outgoing content prepends the blockquote.
    fireEvent.change(screen.getByPlaceholderText('reader.ask.placeholder'), { target: { value: 'what is this?' } })
    fireEvent.click(screen.getByText('reader.ask.send'))
    expect(ask).toHaveBeenCalledWith('> the whale\n\nwhat is this?')
  })

  it('renders an assistant turn as markdown (heading + list) and links inline [n] markers', () => {
    const citation = { marker: 1, chunkId: 'c1', chapterId: 'ch1', chapterOrd: 4, charStart: 0, charEnd: 1, preview: 'snippet' }
    chatState.history = [
      {
        question: 'q',
        answer: '## Summary\n\n- point one [1]\n- point two',
        citations: [citation],
        insufficient: false,
        streaming: false,
      },
    ]
    const onNavigateToCitation = vi.fn()
    render(<AskPanel {...baseProps} isAuthenticated={true} onNavigateToCitation={onNavigateToCitation} />)

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeTruthy()
    expect(screen.getByText('point two')).toBeTruthy()
    // Inline marker is clickable and shares the citation jump handler.
    fireEvent.click(screen.getByRole('button', { name: '[1]' }))
    expect(onNavigateToCitation).toHaveBeenCalledWith(citation)
  })

  it('renders a persisted quoted user turn as a quote card + question text', () => {
    chatState.history = [
      { question: '> the whale\n\nwhat is this?', answer: 'A symbol.', citations: [], insufficient: false, streaming: false },
    ]
    render(<AskPanel {...baseProps} isAuthenticated={true} />)
    expect(screen.getByText('the whale')).toBeTruthy()
    expect(screen.getByText('what is this?')).toBeTruthy()
    expect(screen.getByText('A symbol.')).toBeTruthy()
  })
})
