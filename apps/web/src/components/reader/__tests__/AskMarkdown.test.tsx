import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AskMarkdown } from '../AskMarkdown'
import type { AskCitation } from '../../../api/ask'

afterEach(cleanup)

const cite = (marker: number, over: Partial<AskCitation> = {}): AskCitation => ({
  marker,
  chunkId: `c${marker}`,
  chapterId: `ch${marker}`,
  chapterOrd: marker,
  charStart: 0,
  charEnd: 1,
  preview: `preview ${marker}`,
  ...over,
})

const baseProps = {
  citations: [] as AskCitation[],
  onNavigateToCitation: vi.fn(),
  citationTitle: (c: AskCitation) => `title-${c.marker}`,
}

describe('AskMarkdown', () => {
  it('renders headings, lists, inline code, fenced code and tables', () => {
    const md = [
      '## Overview',
      '',
      '- first',
      '- second',
      '',
      'Some `inline` code and **bold**.',
      '',
      '```',
      'const x = 1',
      '```',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n')

    const { container } = render(<AskMarkdown {...baseProps} text={md} />)

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
    expect(container.querySelectorAll('ul li').length).toBe(2)
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    // Fenced block renders inside <pre><code>.
    expect(container.querySelector('pre code')?.textContent).toContain('const x = 1')
    // GFM table (remark-gfm) with a scroll wrapper.
    expect(container.querySelector('.ask-md__table-wrap table')).toBeTruthy()
    expect(container.querySelectorAll('tbody td').length).toBe(2)
  })

  it('renders a matching [n] marker as a clickable superscript wired to the jump handler', () => {
    const onNavigateToCitation = vi.fn()
    render(
      <AskMarkdown
        {...baseProps}
        text="The whale is a symbol [1] of nature."
        citations={[cite(1)]}
        onNavigateToCitation={onNavigateToCitation}
      />,
    )
    const marker = screen.getByRole('button', { name: '[1]' })
    expect(marker.getAttribute('title')).toBe('title-1')
    fireEvent.click(marker)
    expect(onNavigateToCitation).toHaveBeenCalledWith(cite(1))
  })

  it('leaves a [n] marker as plain (non-button) text when no citation matches', () => {
    render(<AskMarkdown {...baseProps} text="Unknown source [9]." citations={[cite(1)]} />)
    expect(screen.queryByRole('button', { name: '[9]' })).toBeNull()
    expect(screen.getByText(/\[9\]/)).toBeTruthy()
  })

  it('does not turn [n] inside a code block into a citation', () => {
    const { container } = render(
      <AskMarkdown {...baseProps} text={'```\narr[1]\n```'} citations={[cite(1)]} />,
    )
    expect(container.querySelector('pre code')?.textContent).toContain('arr[1]')
    expect(screen.queryByRole('button', { name: '[1]' })).toBeNull()
  })

  it('renders a plain-text answer as a paragraph', () => {
    const { container } = render(<AskMarkdown {...baseProps} text="Just a plain answer." />)
    expect(container.querySelector('p')?.textContent).toBe('Just a plain answer.')
  })
})
